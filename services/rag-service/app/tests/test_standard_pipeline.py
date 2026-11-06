from app.services.standard_pipeline import detect_standard_sections, group_normative_sections


def test_generic_non_iso_sections_and_normative_filter():
    text = """Article 1 Scope
This document applies to equipment.

Article 2 Definitions
A device means a machine.

Article 3 General requirements
The manufacturer shall maintain records.
(a) Records shall be retained for ten years.
(b) The process must be documented.

ANNEX A Guidance
This annex is informative.
"""
    sections = detect_standard_sections(text)
    assert [s.clause_number for s in sections] == ["Article 1", "Article 2", "Article 3", "ANNEX A"]
    assert sections[0].normative_candidate is False
    assert sections[2].normative_candidate is True
    assert sections[3].normative_candidate is False

    groups = group_normative_sections(sections, max_chars=5000)
    assert len(groups) == 1
    assert [s.clause_number for s in groups[0]] == ["Article 3"]


def test_unstructured_large_text_gets_complete_fallback_sections():
    text = "\n\n".join([f"Paragraph {i}: the manufacturer shall document process {i}." for i in range(180)])
    sections = detect_standard_sections(text)
    assert len(sections) >= 2
    assert sum(s.normative_candidate for s in sections) == len(sections)


def test_layout_pdf_extraction_keeps_visual_reading_order(tmp_path):
    """PDF object order can be arbitrary; standards need human reading order."""
    import fitz
    from app.services.pdf_text_layout import extract_pdf_pages_layout

    path = tmp_path / "layout.pdf"
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    # Intentionally insert the right-column text first to simulate a PDF whose
    # content stream order does not match visual order.
    page.insert_text((330, 100), "Right column note that comes later.")
    page.insert_text((60, 100), "1 Scope")
    page.insert_text((60, 125), "This document defines the scope.")
    page.insert_text((330, 130), "Right column continuation.")
    page.insert_text((60, 185), "2 Requirements")
    page.insert_text((60, 210), "The organization shall keep records.")
    doc.save(path)
    doc.close()

    pages = extract_pdf_pages_layout(path.read_bytes())
    text = pages[0][1]
    assert text.index("1 Scope") < text.index("This document defines the scope.")
    assert text.index("2 Requirements") < text.index("The organization shall keep records.")


def test_glyph_spaced_pdf_text_is_repaired_after_layout_extraction(tmp_path):
    import fitz
    from app.services.pdf_text_layout import extract_pdf_pages_layout

    path = tmp_path / "glyphs.pdf"
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    # Build a line where the characters are individually positioned. The word
    # boundary has a visibly larger x-gap, which is how the real problematic PDFs
    # encode the missing spaces.
    x = 60.0
    y = 100.0
    for ch in "e n c l o s u r e":
        page.insert_text((x, y), ch)
        x += 7.0
    page.insert_text((60, 125), "T e r m s,  d e f i n i t i o n s  a n d  a b b r e v i a t e d  t e r m s")
    doc.save(path)
    doc.close()

    text = extract_pdf_pages_layout(path.read_bytes())[0][1]
    assert "enclosure" in text or "e n c l o s u r e" not in text
    assert "Terms, definitions and abbreviated terms" in text


def test_duplicate_clause_headers_are_collapsed():
    text = """1 Scope\nThis applies to machines.\n\n3 Terms, definitions and abbreviated terms\nTerm A means a thing.\n\n3 Terms, definitions and abbreviated terms\nTerm B means another thing.\n\n4 Requirements\nThe manufacturer shall maintain records.\n"""
    sections = detect_standard_sections(text)
    keys = [(s.clause_number, s.heading) for s in sections]
    assert keys.count(("3", "Terms, definitions and abbreviated terms")) == 1
    merged = next(s for s in sections if s.clause_number == "3")
    assert "Term A" in merged.text and "Term B" in merged.text


def test_page_aware_text_is_canonical_source_and_filters_false_numeric_heads():
    pages = [
        "Contents\n1 Scope .... 3\n2 Requirements .... 4\n\n1 Scope\nNot used",  # TOC-like page
        "1 Scope\nThis document applies.\n2 Requirements\nThe manufacturer shall maintain records.\n30 mA.\n18.2 This protective measure comprises both:\n18.2 Verification tests\nThe test shall be performed.",
    ]
    sections = detect_standard_sections("SCRAMBLED RAW TEXT", pages)
    refs = [s.clause_number for s in sections if s.clause_number]
    assert "1" in refs and "2" in refs and "18.2" in refs
    assert "30" not in refs
    # The page-aware source is used instead of the intentionally wrong flat text.
    assert any("This document applies." in s.text for s in sections if s.clause_number == "1")


def test_common_heading_spacing_is_repaired():
    pages = [
        "1 Scope\nText.\n2 Normativereferences\nText.\n3 Terms,definitionsandabbreviatedterms\nText.",
    ]
    sections = detect_standard_sections("", pages)
    headings = {s.clause_number: s.heading for s in sections}
    assert headings["2"] == "Normative references"
    assert headings["3"] == "Terms, definitions and abbreviated terms"


def test_false_figure_labels_and_duplicate_numeric_roots_are_removed():
    pages = [
        "1 Scope\nScope text.\n2 Requirements\nThe manufacturer shall act.\n\n2 Common conductors\nFigure label text.\n\n1 Figure label\nAnother label.\n3 Final\nThe organization shall comply.",
    ]
    sections = detect_standard_sections("", pages)
    refs = [s.clause_number for s in sections if s.clause_number]
    assert refs == ["1", "2", "3"]
