"""Recover text from low-text scanned standard pages without hiding failures."""
from __future__ import annotations

import subprocess
import time
from typing import Any


def recover_standard_scan_pages(
    raw: bytes, pages: list[str], *, languages: str = "eng+fra+ara",
    max_pages: int = 30, total_timeout: float = 300,
) -> tuple[list[str], dict[str, Any]]:
    result = list(pages)
    info: dict[str, Any] = {"ocrPages": [], "unresolvedPages": [], "mixedImagePages": [], "warnings": []}
    try:
        import fitz
        doc = fitz.open(stream=raw, filetype="pdf")
    except Exception as exc:
        info["unresolvedPages"] = [i + 1 for i, text in enumerate(pages) if not text.strip()]
        info["warnings"].append(f"Scanned-page inspection unavailable: {type(exc).__name__}.")
        return result, info

    deadline = time.monotonic() + max(1.0, total_timeout)
    try:
        probe = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True, timeout=10, check=False)
        available = set(probe.stdout.splitlines()[1:]) if probe.returncode == 0 else set()
    except Exception:
        available = set()
    requested = [language.strip() for language in languages.split("+") if language.strip()]
    installed = [language for language in requested if language in available]
    missing = [language for language in requested if language not in available]
    ocr_language = "+".join(installed)
    attempted = 0
    try:
        for index, page in enumerate(doc):
            if index >= len(result):
                result.append("")
            original = result[index].strip()
            # A searchable page can still contain an image-only table or figure.
            # Read substantial embedded images separately rather than ignoring
            # the entire page just because it has a native text layer.
            if len(original) >= 80:
                regions = []
                try:
                    seen = set()
                    for image in page.get_images(full=True):
                        for rect in page.get_image_rects(image[0]):
                            clipped = rect & page.rect
                            area_ratio = abs(clipped.width * clipped.height) / max(1.0, page.rect.width * page.rect.height)
                            key = tuple(round(float(value), 1) for value in clipped)
                            if area_ratio >= 0.18 and key not in seen:
                                regions.append(clipped)
                                seen.add(key)
                except Exception:
                    info["mixedImagePages"].append(index + 1)
                    continue
                if not regions:
                    continue
                info["mixedImagePages"].append(index + 1)
                if attempted >= max(0, max_pages) or time.monotonic() >= deadline or not ocr_language:
                    info["unresolvedPages"].append(index + 1)
                    continue
                attempted += 1
                recognized = []
                failed = False
                for region in regions:
                    try:
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=region, alpha=False)
                        proc = subprocess.run(
                            ["tesseract", "stdin", "stdout", "-l", ocr_language, "--psm", "3"],
                            input=pix.tobytes("png"), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=max(1, min(45, deadline - time.monotonic())), check=False,
                        )
                        if proc.returncode != 0:
                            raise ValueError("image OCR failed")
                        recognized.extend(proc.stdout.decode("utf-8", errors="replace").splitlines())
                    except Exception:
                        failed = True
                if failed:
                    info["unresolvedPages"].append(index + 1)
                normalized = " ".join(original.split()).casefold()
                new_lines = [line.strip() for line in recognized if line.strip() and " ".join(line.split()).casefold() not in normalized]
                if new_lines:
                    result[index] = original + "\n\n" + "\n".join(new_lines)
                    info["ocrPages"].append(index + 1)
                continue
            # Ignore genuinely blank pages and short, text-only pages; detect
            # large scanned images or textless pages containing visible ink.
            image_ratio = 0.0
            try:
                for image in page.get_images(full=True):
                    for rect in page.get_image_rects(image[0]):
                        image_ratio = max(image_ratio, abs(rect.width * rect.height) / max(1.0, page.rect.width * page.rect.height))
                preview = page.get_pixmap(matrix=fitz.Matrix(0.4, 0.4), colorspace=fitz.csGRAY, alpha=False)
                ink_ratio = sum(sample < 220 for sample in preview.samples) / max(1, len(preview.samples))
            except Exception:
                info["unresolvedPages"].append(index + 1)
                continue
            needs_ocr = image_ratio >= 0.20 or (not original and ink_ratio >= 0.01)
            if not needs_ocr:
                continue
            if attempted >= max(0, max_pages) or time.monotonic() >= deadline or not ocr_language:
                info["unresolvedPages"].append(index + 1)
                continue
            attempted += 1
            try:
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                proc = subprocess.run(
                    ["tesseract", "stdin", "stdout", "-l", ocr_language, "--psm", "3"],
                    input=pix.tobytes("png"), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    timeout=max(1, min(45, deadline - time.monotonic())), check=False,
                )
                ocr_text = proc.stdout.decode("utf-8", errors="replace").strip()
                if proc.returncode != 0 or len(ocr_text) < 8:
                    raise ValueError("OCR produced no reliable text")
                # Keep a short original text layer if OCR did not reproduce it.
                if original and " ".join(original.split()).casefold() not in " ".join(ocr_text.split()).casefold():
                    ocr_text = original + "\n\n" + ocr_text
                result[index] = ocr_text
                info["ocrPages"].append(index + 1)
            except Exception:
                info["unresolvedPages"].append(index + 1)
    finally:
        doc.close()
    if missing and (attempted or info["unresolvedPages"]):
        info["warnings"].append("OCR language data unavailable: " + ", ".join(missing) + ".")
    if info["ocrPages"]:
        info["warnings"].append("Some pages were read with OCR; compare their text, numbers and tables with the original.")
    if info["mixedImagePages"]:
        info["warnings"].append("Some text pages also contain large images; verify any diagrams or image-based tables against the original.")
    if info["unresolvedPages"]:
        info["warnings"].append("Some image or low-text pages could not be read; OCR or a text-searchable copy is needed.")
    return result, info
