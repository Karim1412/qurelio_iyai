"""Regression tests for source coverage, regulatory structure and OCR."""
import asyncio
import ast
import json
import re
import shutil
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.services.standard_pipeline import (
    StandardSection, _dedupe_sections, _fallback_sections, _page_furniture,
    detect_standard_metadata, detect_standard_sections,
)
from app.services.standard_semantic_review import review_candidates
from app.tests.test_standard_extraction_accuracy import load_actual_pipeline


class SourceCoverageTests(unittest.TestCase):
    def test_grounding_does_not_accept_a_changed_number(self):
        path = Path(__file__).parents[1] / 'services' / 'structure_openai.py'
        tree = ast.parse(path.read_text())
        names = {'_normalize_grounding_text', '_requirement_grounded_normalized'}
        funcs = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
        module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *funcs], type_ignores=[])
        namespace = {'re': re}
        exec(compile(ast.fix_missing_locations(module), str(path), 'exec'), namespace)
        source = 'The manufacturer shall retain all technical records and the detailed product history for at least 10 years after placing the product on the market.'
        changed = source.replace('10 years', '20 years')
        normalized = namespace['_normalize_grounding_text'](source)
        self.assertTrue(namespace['_requirement_grounded_normalized'](source, normalized))
        self.assertFalse(namespace['_requirement_grounded_normalized'](changed, normalized))

    def test_standard_reference_obligation_is_not_a_header(self):
        self.assertFalse(_page_furniture('ISO 13485 shall be followed by manufacturers'))
        self.assertIn('ISO 13485 shall be followed by manufacturers', review_candidates('ISO 13485 shall be followed by manufacturers'))
        self.assertTrue(_page_furniture('BS EN IEC 60601-1:2010'))

    def test_list_alternatives_keep_qualifiers_and_following_sentence(self):
        source = 'The manufacturer shall choose one of the following:\n(a) option A;\n(b) option B.\nThe choice must be recorded.'
        candidates = review_candidates(source)
        self.assertEqual(len(candidates), 2)
        self.assertIn('one of the following', candidates[0])
        self.assertIn('(a) option A', candidates[0])
        self.assertIn('(b) option B', candidates[0])
        self.assertIn('choice must be recorded', candidates[1])

    def test_articles_without_title_and_unheaded_preamble_are_preserved(self):
        pages = ['Before the articles the manufacturer shall retain records.\nArticle 1\nThe manufacturer shall provide evidence.\nArticle 2\nThe importer must act.']
        sections = detect_standard_sections('', pages)
        self.assertIn('shall retain records', sections[0].text)
        self.assertEqual(sections[0].heading, 'Unnumbered opening')
        by_ref = {section.clause_number: section for section in sections}
        self.assertIn('shall provide evidence', by_ref['Article 1'].text)
        self.assertIn('must act', by_ref['Article 2'].text)

    def test_same_long_text_in_different_clauses_is_not_dropped(self):
        content = 'The manufacturer shall retain the technical documentation for ten years. ' * 4
        sections = [StandardSection('4.1', 'First', content, 0, 100, 0, True),
                    StandardSection('5.1', 'Second', content, 101, 200, 1, True)]
        self.assertEqual(len(_dedupe_sections(sections)), 2)

    def test_long_fallback_does_not_cut_a_requirement(self):
        requirement = 'The organization shall ' + ('retain records and evidence ' * 80) + 'until the applicable period ends.'
        sections = _fallback_sections(requirement, max_chars=100)
        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0].text, requirement)

    def test_regulation_and_directive_metadata(self):
        for source, expected in [('REGULATION (EU) 2017/745', 'REGULATION (EU) 2017/745'),
                                 ('Council Directive 93/42/EEC', 'Directive 93/42/EEC'),
                                 ('21 CFR Part 820', '21 CFR Part 820')]:
            with self.subTest(source=source):
                self.assertEqual(detect_standard_metadata(source, None)['reference'], expected)
        source = 'ISO 13485:2016\nThis standard refers to Regulation (EU) 2017/745.'
        self.assertEqual(detect_standard_metadata(source, 'ISO 13485:2016')['reference'], 'ISO 13485:2016')

    def test_multilingual_regulation_headings_keep_their_original_labels(self):
        for heading, text in [('Articolo 1', 'Il fabbricante deve conservare i documenti.'),
                              ('Artículo 1', 'El fabricante debe conservar los registros.'),
                              ('Artikel 1', 'Der Hersteller muss Aufzeichnungen aufbewahren.'),
                              ('المادة 1', 'يجب على المصنع الاحتفاظ بالسجلات.')]:
            with self.subTest(heading=heading):
                sections = detect_standard_sections('', [heading + '\n' + text])
                self.assertEqual(sections[0].clause_number, heading)
                self.assertIn(text, sections[0].text)

    def test_annex_letters_are_valid_compliance_references(self):
        from app.services.compliance_guard import clause_reference_quality
        for ref in ('Annex A', 'Annex ZA', 'Annex VIII', 'Annex A.1'):
            with self.subTest(ref=ref): self.assertTrue(clause_reference_quality(ref)['valid'])
        self.assertFalse(clause_reference_quality('UNMAPPED')['valid'])

    def test_obligation_on_dense_table_page_is_not_discarded(self):
        lines = [f'{i}. Value {i} {i * 10}' for i in range(1, 9)]
        lines.insert(4, 'The maximum pressure shall not exceed 10 kPa.')
        sections = detect_standard_sections('', ['1 Requirements\n' + '\n'.join(lines)])
        self.assertTrue(any('pressure shall not exceed' in section.text for section in sections))


class ModelPipelineTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def parse_jobs(user):
        jobs = []
        for part in user.split('\n---\n'):
            match = re.search(r'JOB_ID: ([^\n]+)', part)
            if match:
                jobs.append((match.group(1), re.findall(r'CANDIDATE (\d+): ([^\n]+)', part)))
        return jobs

    async def test_grouped_list_replaces_partial_deterministic_stem(self):
        async def complete(_client, _model, **kwargs):
            jobs = self.parse_jobs(kwargs['messages'][1]['content'])
            rows = [{'jobId': key, 'annotations': [{'candidateId': int(cid), 'type': 'mandatory'} for cid, _ in candidates]} for key, candidates in jobs]
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'sections': rows})))])
        pipeline = load_actual_pipeline(complete)
        text = '4 Safety\nThe manufacturer shall choose one of the following:\n(a) option A;\n(b) option B.\nThe choice must be recorded.'
        result = await pipeline(full_text=text, file_name='standard.pdf', iso_hint=None, description_hint=None,
                                client=None, model='test', cfg=SimpleNamespace(RETRY_BACKOFF_SEC=0))
        reqs = [r['text'] for s in result['sections'] for r in s['requirements']]
        self.assertEqual(len(reqs), 2)
        self.assertTrue(any('option A' in text and 'option B' in text and 'one of' in text for text in reqs))
        self.assertFalse(any(text.strip().endswith('following:') for text in reqs))
        self.assertTrue(result['standardExtractionQuality']['processingComplete'])

    async def test_invalid_multi_job_response_is_isolated_and_retried(self):
        calls = []
        async def complete(_client, _model, **kwargs):
            jobs = self.parse_jobs(kwargs['messages'][1]['content'])
            calls.append(len(jobs))
            rows = [] if len(jobs) > 1 else [{'jobId': key, 'annotations': [{'candidateId': int(cid), 'type': 'mandatory'} for cid, _ in candidates]} for key, candidates in jobs]
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'sections': rows})))])
        pipeline = load_actual_pipeline(complete)
        text = '4 Safety\nThe manufacturer shall retain records.\n\n5 Inspection\nThe manufacturer shall inspect equipment.'
        result = await pipeline(full_text=text, file_name='standard.pdf', iso_hint=None, description_hint=None,
                                client=None, model='test', cfg=SimpleNamespace(RETRY_BACKOFF_SEC=0, STANDARD_REQUIREMENT_BATCH_CHARS=6000))
        self.assertIn(2, calls)
        self.assertGreaterEqual(calls.count(1), 2)
        self.assertTrue(result['standardExtractionQuality']['processingComplete'])
        self.assertEqual(sum(len(s['requirements']) for s in result['sections']), 2)

    async def test_model_rejecting_explicit_obligation_requires_review(self):
        async def complete(_client, _model, **kwargs):
            jobs = self.parse_jobs(kwargs['messages'][1]['content'])
            rows = [{'jobId': key, 'annotations': [{'candidateId': int(cid), 'type': 'non_requirement'} for cid, _ in candidates]} for key, candidates in jobs]
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'sections': rows})))])
        pipeline = load_actual_pipeline(complete)
        result = await pipeline(full_text='4 Safety\nThe manufacturer shall retain records.', file_name='standard.pdf',
                                iso_hint=None, description_hint=None, client=None, model='test', cfg=SimpleNamespace(RETRY_BACKOFF_SEC=0))
        self.assertFalse(result['standardExtractionQuality']['processingComplete'])
        self.assertTrue(any('shall retain records' in r['text'] for s in result['sections'] for r in s['requirements']))

    async def test_pdf_to_classification_and_clause_summary(self):
        import fitz
        from app.services.pdf_text_layout import extract_pdf_pages_layout
        document = fitz.open()
        page = document.new_page(width=600, height=800)
        page.insert_text((45, 75), 'Article 1')
        page.insert_text((45, 100), 'General obligations')
        page.insert_text((45, 140), 'The manufacturer shall retain the technical records.')
        page.insert_text((45, 790), 'COPYRIGHT 2026')
        page = document.new_page(width=600, height=800)
        page.insert_text((45, 75), 'Article 2')
        page.insert_text((45, 100), 'Safety requirements')
        page.insert_text((45, 140), 'The manufacturer must inspect each device before release.')
        raw = document.tobytes(); document.close()
        pages = [text for _, text in extract_pdf_pages_layout(raw)]
        async def complete(_client, _model, **kwargs):
            jobs = self.parse_jobs(kwargs['messages'][1]['content'])
            rows = [{'jobId': key, 'annotations': [
                {'candidateId': int(cid), 'type': 'mandatory' if re.search(r'\b(?:shall|must)\b', content, re.I) else 'non_requirement'}
                for cid, content in candidates]} for key, candidates in jobs]
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'sections': rows})))])
        pipeline = load_actual_pipeline(complete)
        result = await pipeline(full_text='\n\n'.join(pages), page_texts=pages, file_name='regulation.pdf',
                                iso_hint=None, description_hint=None, client=None, model='test', cfg=SimpleNamespace(RETRY_BACKOFF_SEC=0))
        path = Path(__file__).parents[1] / 'services' / 'structure_openai.py'
        tree = ast.parse(path.read_text())
        names = {'_normalize_grounding_text', '_requirement_grounded_normalized', '_is_descendant_standard_clause_ref',
                 '_leading_requirement_clause_reference', '_normalize_standard_clause_ref', '_standard_section_context_specific',
                 '_count_modal_sentences', 'compute_standard_requirements_summary'}
        funcs = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
        unit = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *funcs], type_ignores=[])
        namespace = {'re': re, '_MODAL_SENTENCE_RE': re.compile(r'[^.!?\n]*\b(?:shall|must)\b[^.!?\n]*[.!?]', re.I)}
        exec(compile(ast.fix_missing_locations(unit), str(path), 'exec'), namespace)
        summary = namespace['compute_standard_requirements_summary'](result['sections'], raw_text='\n\n'.join(pages))
        self.assertEqual({item['clauseRef'] for item in summary['requirements']}, {'Article 1', 'Article 2'})
        self.assertEqual(len(summary['requirements']), 2)
        self.assertTrue(all(item['groundedInSection'] for item in summary['requirements']))
        self.assertTrue(result['standardExtractionQuality']['processingComplete'])


class MixedImagePdfTests(unittest.TestCase):
    def test_pdf_table_preserves_cell_headers_and_values_as_one_passage(self):
        import fitz
        from app.services.pdf_text_layout import extract_pdf_pages_layout
        doc = fitz.open(); page = doc.new_page(width=600, height=800)
        page.insert_text((50, 60), '1 Requirements')
        page.insert_text((50, 90), 'Table 1 Safety limits')
        for x in (50, 300, 550): page.draw_line((x, 110), (x, 230))
        for y in (110, 150, 190, 230): page.draw_line((50, y), (550, y))
        for x, y, text in [(60, 135, 'Property'), (310, 135, 'Maximum permitted value'),
                           (60, 175, 'Pressure'), (310, 175, '10 kPa'),
                           (60, 215, 'Temperature'), (310, 215, '25 C')]:
            page.insert_text((x, y), text)
        raw = doc.tobytes(); doc.close()
        extracted = extract_pdf_pages_layout(raw)[0][1]
        self.assertIn('Pressure | 10 kPa', extracted)
        self.assertIn('Temperature | 25 C', extracted)
        candidates = review_candidates(extracted)
        self.assertTrue(any('Maximum permitted value' in item and '10 kPa' in item and '25 C' in item for item in candidates))

    @unittest.skipUnless(shutil.which('tesseract') and Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').exists(), 'OCR unavailable')
    def test_text_page_with_embedded_image_requirement_is_ocr_read(self):
        import fitz
        from io import BytesIO
        from PIL import Image, ImageDraw, ImageFont
        from app.services.standard_ocr import recover_standard_scan_pages
        image = Image.new('RGB', (1000, 480), 'white')
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 42)
        draw.text((45, 95), 'Pressure shall not exceed 10 kPa.', fill='black', font=font)
        stream = BytesIO(); image.save(stream, format='PNG')
        doc = fitz.open(); page = doc.new_page(width=600, height=800)
        page.insert_image(fitz.Rect(50, 100, 550, 400), stream=stream.getvalue())
        raw = doc.tobytes(); doc.close()
        original = 'Native layer: the product has a test report. ' * 4
        pages, info = recover_standard_scan_pages(raw, [original], languages='eng', max_pages=1, total_timeout=45)
        self.assertEqual(info['mixedImagePages'], [1])
        self.assertEqual(info['unresolvedPages'], [])
        self.assertIn('pressure shall not exceed', pages[0].lower())
        self.assertIn(original.strip(), pages[0])


if __name__ == '__main__': unittest.main()
