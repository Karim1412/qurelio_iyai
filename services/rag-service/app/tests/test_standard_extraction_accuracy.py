"""Offline regression tests; no provider credentials or external calls needed."""
import ast
import asyncio
import importlib.util
import json
import re
import shutil
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services.standard_pipeline import detect_standard_metadata, detect_standard_sections, deterministic_requirements
from app.services.standard_semantic_review import (
    grounded_detail, group_review_jobs, make_review_jobs, review_candidates, validate_review_response,
)


class CandidateTests(unittest.TestCase):
    def test_explicit_and_implicit_sentences_are_both_reviewed(self):
        text = "The manufacturer shall keep records. Records are retained for ten years. NOTE: An example only."
        candidates = review_candidates(text)
        self.assertEqual(len(candidates), 3)
        self.assertIn("Records are retained for ten years.", candidates)

    def test_languages_and_prohibitions_are_detected(self):
        for text in ["Il fabbricante deve conservare i documenti.",
                     "يجب على المصنع الاحتفاظ بالسجلات.",
                     "El fabricante debe conservar los registros.",
                     "Der Hersteller muss Aufzeichnungen aufbewahren."]:
            with self.subTest(text=text):
                self.assertTrue(deterministic_requirements(text))
                self.assertTrue(any(s.normative_candidate for s in detect_standard_sections(text)))

    def test_candidate_pagination_never_drops_tail(self):
        text = " ".join(f"Requirement number {i} is retained." for i in range(40))
        section = SimpleNamespace(text=text, order=0, clause_number="1", heading="Requirements")
        jobs = make_review_jobs([section], max_chars=180, max_candidates=4)
        self.assertEqual(sum(len(j["candidates"]) for j in jobs), 40)
        self.assertEqual(len({j["id"] for j in jobs}), len(jobs))
        self.assertIn("39", jobs[-1]["candidates"][-1])

    def test_missing_duplicate_or_invalid_model_annotations_fail(self):
        section = SimpleNamespace(text="First sentence. Second sentence.", order=0, clause_number="1", heading="Test")
        jobs = make_review_jobs([section])
        good = {"sections": [{"jobId": jobs[0]["id"], "annotations": [
            {"candidateId": 1, "type": "mandatory"}, {"candidateId": 2, "type": "non_requirement"}]}]}
        self.assertEqual(len(validate_review_response(good, jobs)), 1)
        bad = [
            {"sections": []},
            {"sections": [{"jobId": jobs[0]["id"], "annotations": [{"candidateId": 1, "type": "mandatory"}]}]},
            {"sections": [{"jobId": jobs[0]["id"], "annotations": [{"candidateId": 1, "type": "mandatory"}, {"candidateId": 1, "type": "mandatory"}]}]},
            {"sections": [{"jobId": jobs[0]["id"], "annotations": [{"candidateId": 1, "type": "invented"}, {"candidateId": 2, "type": "mandatory"}]}]},
        ]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                validate_review_response(payload, jobs)

    def test_conditions_and_references_must_be_from_source(self):
        self.assertEqual(grounded_detail("when applicable", "Apply when applicable."), "when applicable")
        self.assertIsNone(grounded_detail("after ten days", "Apply when applicable."))

    def test_page_aware_unstructured_document_is_not_dropped(self):
        pages = ["The manufacturer shall keep all records for ten years."]
        sections = detect_standard_sections("", pages)
        self.assertTrue(sections)
        self.assertIn("shall keep", sections[0].text)
        self.assertEqual(sections[0].page_start, 1)

    def test_blank_leading_page_does_not_shift_clause_content_or_page(self):
        pages = ["", "  1 Requirements\nThe manufacturer shall keep records.  "]
        sections = detect_standard_sections("", pages)
        first = next(section for section in sections if section.clause_number == "1")
        self.assertEqual(first.page_start, 2)
        self.assertIn("The manufacturer shall keep records.", first.text)
        self.assertNotIn("manufacturer shall keep records.  ", first.text)

    def test_benchmark_counts_missing_and_extra_requirements(self):
        path = Path(__file__).parents[2] / "scripts" / "evaluate_standard_extraction.py"
        spec = importlib.util.spec_from_file_location("standard_benchmark", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        def document(texts):
            return {"sections": [{"clauseNumber": "4", "requirements": [{"text": t, "type": "mandatory"} for t in texts]}]}
        result = module.compare(document(["Keep records.", "Provide evidence."]), document(["Keep records.", "Train staff."]))
        self.assertEqual(result["precision"], 0.5)
        self.assertEqual(result["recall"], 0.5)
        self.assertEqual(len(result["missed"]), 1)
        self.assertEqual(len(result["extraOrDifferent"]), 1)


def load_actual_pipeline(completion):
    # Execute the actual pipeline function from the application source, while
    # substituting only the provider function. This also runs without the
    # optional network client dependencies installed in a developer checkout.
    source_path = Path(__file__).parents[1] / "services" / "structure_openai.py"
    module = ast.parse(source_path.read_text())
    function = next(n for n in module.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "_extract_standard_requirements_pipeline")
    unit = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), function], type_ignores=[])
    namespace = dict(asyncio=asyncio, json=json, re=re, time=time, detect_standard_sections=detect_standard_sections,
                     detect_standard_metadata=detect_standard_metadata, _create_structuring_completion=completion,
                     _strip_code_fence=lambda raw: raw)
    exec(compile(ast.fix_missing_locations(unit), str(source_path), "exec"), namespace)
    return namespace["_extract_standard_requirements_pipeline"]


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_model_reviews_implicit_obligation_in_same_section(self):
        async def fake_completion(_client, _model, **kwargs):
            user = kwargs["messages"][1]["content"]
            rows = []
            for part in user.split("\n---\n"):
                job = re.search(r"JOB_ID: ([^\n]+)", part)
                if not job:
                    continue
                annotations = []
                for cid, content in re.findall(r"CANDIDATE (\d+): ([^\n]+)", part):
                    kind = "non_requirement" if content.startswith("NOTE:") else "mandatory"
                    annotations.append({"candidateId": int(cid), "type": kind})
                rows.append({"jobId": job.group(1), "annotations": annotations})
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({"sections": rows})))])
        pipeline = load_actual_pipeline(fake_completion)
        text = "4 Requirements\nThe manufacturer shall keep records. Records are retained for ten years. NOTE: An example only."
        progress = []
        async def record_progress(event):
            progress.append(event)
        result = await pipeline(full_text=text, file_name="standard.pdf", iso_hint=None, description_hint=None,
                                client=None, model="test", cfg=SimpleNamespace(RETRY_BACKOFF_SEC=0),
                                progress_callback=record_progress)
        requirements = [req["text"] for section in result["sections"] for req in section["requirements"]]
        self.assertTrue(any("shall keep" in req for req in requirements))
        self.assertTrue(any("ten years" in req for req in requirements))
        self.assertFalse(any("example only" in req for req in requirements))
        self.assertTrue(result["standardExtractionQuality"]["processingComplete"])
        self.assertEqual(progress[-1]["reviewedJobs"], progress[-1]["totalJobs"])
        self.assertGreater(progress[-1]["providerRequests"], 0)

    async def test_empty_model_response_cannot_be_reported_complete(self):
        async def fake_completion(*args, **kwargs):
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"sections":[]}'))])
        pipeline = load_actual_pipeline(fake_completion)
        result = await pipeline(full_text="4 Requirements\nThe manufacturer shall keep records. Records are retained for ten years.",
                                file_name="standard.pdf", iso_hint=None, description_hint=None,
                                client=None, model="test", cfg=SimpleNamespace(RETRY_BACKOFF_SEC=0))
        quality = result["standardExtractionQuality"]
        self.assertFalse(quality["processingComplete"])
        self.assertTrue(quality["pendingSemanticSections"])
        self.assertEqual(quality["semanticJobsAnalyzed"], 0)
        self.assertTrue(any(s["requirements"] for s in result["sections"]))

    async def test_disabled_ai_is_incomplete_not_silently_complete(self):
        async def fake_completion(*args, **kwargs):
            self.fail("the provider should not be called")
        pipeline = load_actual_pipeline(fake_completion)
        result = await pipeline(full_text="1 Safety\nThe organization shall keep records.", file_name="test.pdf",
                                iso_hint=None, description_hint=None, client=None, model="test",
                                cfg=SimpleNamespace(STANDARD_LLM_ENABLED=False))
        self.assertFalse(result["standardExtractionQuality"]["processingComplete"])


class PdfTests(unittest.TestCase):
    def test_short_text_page_is_not_dropped_by_pdf_extractor(self):
        import io
        import fitz
        from pypdf import PdfReader
        source_path = Path(__file__).parents[1] / "services" / "extractors.py"
        module = ast.parse(source_path.read_text())
        function = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == "extract_pdf")
        unit = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), function], type_ignores=[])
        def extracted_file(**kwargs):
            return SimpleNamespace(pages_text=[], page_spans=[], doc_text="", text_classified=False,
                                   scanned_pages=[], page_count=0, error=None, **kwargs)
        namespace = {"ExtractedFile": extracted_file, "PdfReader": PdfReader, "io": io,
                     "get_settings": lambda: SimpleNamespace(TEXT_FALLBACK_MIN_CHARS=80)}
        exec(compile(ast.fix_missing_locations(unit), str(source_path), "exec"), namespace)
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 100), "The manufacturer shall keep records.")
        raw = doc.tobytes()
        doc.close()
        result = namespace["extract_pdf"](raw)
        self.assertIn("manufacturer shall keep records", result.doc_text)
        self.assertEqual(result.pages_text[0][0], 0)
        self.assertEqual(result.scanned_pages, [1])

    def test_short_text_and_table_requirements_survive_page_footer(self):
        import fitz
        from app.services.pdf_text_layout import extract_pdf_pages_layout
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((50, 60), "1 Safety")
        page.insert_text((50, 110), "Table 1: Safety requirements")
        page.insert_text((50, 135), "The pressure shall not exceed 10 kPa.")
        page.insert_text((50, 800), "NO COPYING WITHOUT PERMISSION")
        raw = doc.tobytes()
        doc.close()
        extracted = extract_pdf_pages_layout(raw)[0][1]
        self.assertIn("pressure shall not exceed 10 kPa", extracted)
        self.assertIn("Table 1", extracted)

    def test_blank_page_is_not_reported_as_unreadable_scan(self):
        import fitz
        from app.services.standard_ocr import recover_standard_scan_pages
        doc = fitz.open()
        doc.new_page()
        raw = doc.tobytes()
        doc.close()
        _, info = recover_standard_scan_pages(raw, [""], languages="eng", max_pages=1, total_timeout=30)
        self.assertEqual(info["unresolvedPages"], [])

    def test_repeated_edge_headers_are_removed_but_body_requirements_remain(self):
        import fitz
        from app.services.pdf_text_layout import extract_pdf_pages_layout
        doc = fitz.open()
        for page_number in range(3):
            page = doc.new_page(width=595, height=842)
            page.insert_text((50, 30), "EXAMPLE STANDARD HEADER")
            page.insert_text((50, 130), "The manufacturer shall keep records.")
            page.insert_text((50, 160), f"Additional requirement number {page_number + 1}.")
            page.insert_text((50, 820), "EXAMPLE FOOTER")
        raw = doc.tobytes()
        doc.close()
        for _, text in extract_pdf_pages_layout(raw):
            self.assertNotIn("EXAMPLE STANDARD HEADER", text)
            self.assertNotIn("EXAMPLE FOOTER", text)
            self.assertIn("manufacturer shall keep records", text)

    @staticmethod
    def _scan_pdf():
        import fitz
        from PIL import Image, ImageDraw, ImageFont
        from io import BytesIO
        image = Image.new("RGB", (1200, 1600), "white")
        draw = ImageDraw.Draw(image)
        font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        font = ImageFont.truetype(str(font_path), 38) if font_path.exists() else ImageFont.load_default()
        draw.text((70, 120), "The manufacturer shall keep records.", fill="black", font=font)
        draw.text((70, 210), "Records shall be retained for ten years.", fill="black", font=font)
        image_data = BytesIO()
        image.save(image_data, format="PNG")
        doc = fitz.open()
        page = doc.new_page(width=600, height=800)
        page.insert_image(page.rect, stream=image_data.getvalue())
        raw = doc.tobytes()
        doc.close()
        return raw

    @unittest.skipUnless(shutil.which("tesseract") and Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf").exists(), "OCR runtime unavailable")
    def test_scanned_page_is_read_by_real_tesseract(self):
        from app.services.standard_ocr import recover_standard_scan_pages
        pages, info = recover_standard_scan_pages(self._scan_pdf(), [""], languages="eng", max_pages=1, total_timeout=45)
        self.assertEqual(info["ocrPages"], [1])
        self.assertEqual(info["unresolvedPages"], [])
        self.assertIn("manufacturer shall keep records", pages[0].lower())
        self.assertIn("ten years", pages[0].lower())

    def test_scan_without_ocr_is_flagged_incomplete(self):
        from app.services.standard_ocr import recover_standard_scan_pages
        with patch("app.services.standard_ocr.subprocess.run", side_effect=FileNotFoundError()):
            _, info = recover_standard_scan_pages(self._scan_pdf(), [""], languages="eng", max_pages=1, total_timeout=5)
        self.assertEqual(info["unresolvedPages"], [1])


if __name__ == "__main__":
    unittest.main()
