import asyncio
import sys
import types
from types import MethodType, SimpleNamespace

_STUB_MODULE_NAMES = (
    "langchain_openai", "langchain", "langchain.prompts",
    "app.services.ingestion", "app.services.event_bus", "app.services.rate_limit", "app.config",
)
_ORIGINAL_MODULES = {name: sys.modules.get(name) for name in _STUB_MODULE_NAMES}

# Keep this test independent of optional runtime LLM packages that are not installed
# in the minimal CI environment; the test exercises pure Compliance Engine logic.
if "langchain_openai" not in sys.modules:
    m = types.ModuleType("langchain_openai")
    class ChatOpenAI:  # pragma: no cover - constructor is not used by these tests
        def __init__(self, *args, **kwargs): pass
    m.ChatOpenAI = ChatOpenAI
    sys.modules["langchain_openai"] = m

if "langchain" not in sys.modules:
    lang = types.ModuleType("langchain")
    prompts = types.ModuleType("langchain.prompts")
    class _Prompt:
        @classmethod
        def from_template(cls, *args, **kwargs): return cls()
        def __or__(self, other): return self
    prompts.ChatPromptTemplate = _Prompt
    sys.modules["langchain"] = lang
    sys.modules["langchain.prompts"] = prompts

if "app.services.ingestion" not in sys.modules:
    mod = types.ModuleType("app.services.ingestion")
    class IngestionService: pass
    mod.IngestionService = IngestionService
    sys.modules["app.services.ingestion"] = mod

if "app.services.event_bus" not in sys.modules:
    mod = types.ModuleType("app.services.event_bus")
    mod.get_event_bus = lambda: None
    sys.modules["app.services.event_bus"] = mod

if "app.services.rate_limit" not in sys.modules:
    mod = types.ModuleType("app.services.rate_limit")
    async def retry_with_backoff(fn, **kwargs): return await fn()
    async def run_compliance_limited(awaitable, timeout=None): return await awaitable
    mod.retry_with_backoff = retry_with_backoff
    mod.run_compliance_limited = run_compliance_limited
    sys.modules["app.services.rate_limit"] = mod

if "app.config" not in sys.modules:
    mod = types.ModuleType("app.config")
    class _Settings(SimpleNamespace):
        OPENAI_API_KEY=''; OPENAI_BASE_URL=''; OPENAI_MODEL='';
        COMPLIANCE_REASONING_EFFORT=''; COMPLIANCE_MAX_TOKENS=500;
        CHAT_LLM_FALLBACK_API_KEY=''; CHAT_LLM_FALLBACK_BASE_URL=''; CHAT_LLM_FALLBACK_MODEL='';
        LLM_MAX_TOKENS=500; DOCUMENT_SERVICE_URL=''; DOCUMENT_INTERNAL_TOKEN='';
        CLAUSE_TIMEOUT_SEC=120; COMPLIANCE_LLM_TIMEOUT_SEC=60; LLM_REQUEST_TIMEOUT_SEC=60;
        COMPLIANCE_LLM_ATTEMPTS=1; COMPLIANCE_SEARCH_TIMEOUT_SEC=5; COMPLIANCE_SEARCH_CONCURRENCY=2;
        DOCUMENTS_SEARCH_TIMEOUT_SEC=5
    mod.get_settings = lambda: _Settings()
    sys.modules["app.config"] = mod

from app.services.evaluation_engine import (
    _recover_requirement_clause_ref,
    _structured_clause_records,
    _leading_clause_reference,
    _build_requirements_block,
    _clause_timeout_for_requirement_count,
    _pack_judge_batches,
    _resolve_evidence_reference_indexes,
    EvaluationEngine,
    EvidenceExcerpt,
    ClauseRecord,
)
import app.services.evaluation_engine as evaluation_engine_module

# The engine module has already bound the stubs it needs for these focused tests.
# Restore the global import table now so other test modules can import the real
# rate-limit/config modules and do not inherit incomplete fake modules.
for _module_name, _original_module in _ORIGINAL_MODULES.items():
    if _original_module is None:
        sys.modules.pop(_module_name, None)
    else:
        sys.modules[_module_name] = _original_module

from app.services.compliance_comparator import reconcile_llm_judgment
from app.models.schemas import ClauseResult


def test_part1_is_recovered_from_section_similarity():
    req = {
        "clauseRef": "Part 1",
        "clauseTitle": "Overcurrent protection",
        "text": "Overcurrent protection shall be provided for conductors.",
    }
    sections = {
        "7.2.4": {"title": "Overcurrent protection", "content": "Overcurrent protection shall be provided for conductors."},
        "8.3": {"title": "Control circuits", "content": "Control circuits shall be arranged safely."},
    }
    ref, confidence, method = _recover_requirement_clause_ref(req, sections)
    assert ref == "7.2.4"
    assert confidence >= 0.55
    assert method == "section_similarity"


def test_unresolved_part1_is_flagged_for_review_not_fabricated():
    req = {"clauseRef": "Part 1", "text": "The equipment shall satisfy a highly specific requirement."}
    sections = {"7.2.4": {"title": "Overcurrent protection", "content": "Protection devices shall be provided."}}
    ref, confidence, method = _recover_requirement_clause_ref(req, sections)
    assert ref == "Part 1"
    assert confidence < 0.38
    assert method == "unresolved"


def test_clause_result_carries_applicability_and_inconclusive_reason():
    row = ClauseResult(
        clause_reference="7.2",
        clause_title="Protection",
        clause_summary="...",
        clause_text_excerpt="...",
        status="INCONCLUSIVE",
        verdict="INCONCLUSIVE",
        confidence=0.0,
        supporting_evidence=[],
        gaps=[],
        suggestions=[],
        legacy_score=0.0,
        legacy_status="INCONCLUSIVE",
        applicability={"scope": "REVIEW", "kind": "CLAUSE_MAPPING_REVIEW"},
        inconclusive_reason="Clause mapping requires review.",
    )
    assert row.applicability["scope"] == "REVIEW"
    assert row.inconclusive_reason == "Clause mapping requires review."


def test_inconclusive_never_gets_an_accepted_llm_reason():
    status, conf, reason = reconcile_llm_judgment(
        "INCONCLUSIVE", 0.0,
        {"applicability": {"scope": "IN_SCOPE"}, "reason": "provider unavailable"},
        0, 0,
    )
    assert status == "INCONCLUSIVE"
    assert "accepted" not in reason.lower()
    assert "provider unavailable" in reason.lower()


def test_batch_prompt_preserves_all_requirement_texts_without_truncation():
    requirements = [
        {"id": f"req-{i}", "type": "mandatory", "modalVerb": "shall", "text": f"Requirement {i} " + ("detail " * 200) + f"END_MARKER_{i}"}
        for i in range(1, 7)
    ]
    # Use the same default path as production; no character cap may silently remove
    # the end of a normative requirement before it reaches the judge model.
    block = _build_requirements_block(requirements)
    for i in range(1, 7):
        assert f"req-{i}" in block
        assert f"END_MARKER_{i}" in block


def test_judge_batch_packing_preserves_every_requirement_and_original_index():
    requirements = [
        (idx, {"id": f"req-{idx}", "text": (f"requirement {idx} " + ("x " * 300)) + f"END-{idx}"})
        for idx in range(1, 15)
    ]
    comparisons = {idx: {"coverage": "PARTIAL", "reason": f"comparison {idx}"} for idx, _ in requirements}
    batches = _pack_judge_batches(requirements, comparisons, max_items=6, max_chars=2200)
    flattened = [idx for batch in batches for idx, _ in batch]
    assert flattened == list(range(1, 15))
    assert all(len(batch) <= 6 for batch in batches)
    for batch in batches:
        for idx, req in batch:
            assert req["id"] == f"req-{idx}"
            assert f"END-{idx}" in _build_requirements_block([req], [comparisons[idx]])


def test_failed_semantic_batch_does_not_prevent_later_batch_from_completing(monkeypatch):
    engine = object.__new__(EvaluationEngine)
    engine.llm = object()
    requirements = [
        {"id": f"REQ-{i}", "text": f"The manufacturer shall document inspection {i}.", "type": "mandatory", "modalVerb": "shall"}
        for i in range(1, 8)
    ]
    record = ClauseRecord(
        ref="8.2", title="Inspection", text="inspection clause", section_type="normative",
        requirements=requirements,
    )
    evidence = EvidenceExcerpt(
        document_id="product-doc", excerpt="inspection evidence", similarity_score=0.9,
        source_label="Product manual, p. 3",
    )
    invoked = []

    class _Bus:
        async def publish(self, *args, **kwargs): return None

    async def fake_retrieve(self, evaluation_id, company_id, clause_id, evidence_ids, queries, product_snapshot=None):
        return "", [evidence], []

    async def fake_judge(self, chain, payload, expected_count, label, repair_attempts=1):
        invoked.append(label)
        if label.endswith("batch0"):
            raise RuntimeError("simulated provider failure for first batch")
        return ({"judgments": [
            {"requirement_index": i, "status": "MISSING_INFO",
             "justification": f"MISSING_INFO: evidence for item {i} was not supplied.",
             "confidence": 0.6, "evidence_refs": [1]}
            for i in range(1, expected_count + 1)
        ]}, None)

    monkeypatch.setattr(evaluation_engine_module, "get_event_bus", lambda: _Bus())
    monkeypatch.setattr(evaluation_engine_module, "compare_requirement", lambda req, snapshot: {
        "version": 4, "requirementId": req.get("id"), "clauseRef": "8.2",
        "standardRequirement": req.get("text", ""), "coverage": "NONE", "decision": None,
        "method": "test_ambiguous", "confidence": 0.2, "elements": [],
        "reason": "No deterministic Product comparison is available.",
        "applicability": {"scope": "IN_SCOPE", "kind": "PRODUCT_OR_GENERAL", "confidence": 0.8, "reason": "In scope for test."},
    })
    monkeypatch.setattr(engine, "_retrieve_evidence", MethodType(fake_retrieve, engine))
    monkeypatch.setattr(engine, "_select_requirement_evidence", lambda requirement_text, supporting, limit=4: [0])
    monkeypatch.setattr(engine, "_judge_with_repair", MethodType(fake_judge, engine))

    rows = asyncio.run(engine._eval_clause_from_record(
        "evaluation-2", "company-1", record, ["product-doc"], "standard-doc", product_snapshot=object(),
    ))
    assert len(invoked) == 2
    assert len(rows) == 7
    assert all(row.status == "INCONCLUSIVE" for row in rows[:6])
    assert rows[6].requirement_id == "REQ-7"
    assert rows[6].status == "MISSING_INFO"


def test_evidence_rendering_returns_only_indexes_that_really_appear_in_prompt():
    evidence = [
        EvidenceExcerpt(document_id=f"doc-{i}", excerpt=(f"evidence item {i} " + "content " * 250), similarity_score=0.9, source_label=f"Source {i}")
        for i in range(8)
    ]
    block, rendered = EvaluationEngine._render_evidence_items_with_indexes(
        evidence, list(range(8)), max_chars=500,
    )
    assert len(block) <= 500
    assert len(rendered) < len(evidence)
    assert all(f'source="Source {i}"' in block for i in rendered)
    assert rendered == list(range(len(rendered)))


def test_structured_clause_evaluates_every_batch_and_preserves_long_requirement_text(monkeypatch):
    engine = object.__new__(EvaluationEngine)
    engine.llm = object()
    requirements = [
        {
            "id": f"REQ-{i}",
            "text": f"Requirement {i} shall have its own full wording " + ("detail " * 180) + f"END_REQUIREMENT_{i}",
            "type": "mandatory",
            "modalVerb": "shall",
        }
        for i in range(1, 15)
    ]
    record = ClauseRecord(
        ref="7.1", title="Inspection and verification", text="inspection clause text",
        section_type="normative", requirements=requirements,
    )
    evidence = EvidenceExcerpt(
        document_id="product-doc", excerpt="inspection evidence and documented procedure",
        similarity_score=0.9, source_label="Product manual, p. 2",
    )
    calls = []

    class _Bus:
        async def publish(self, *args, **kwargs):
            return None

    async def fake_retrieve(self, evaluation_id, company_id, clause_id, evidence_ids, queries, product_snapshot=None):
        return "", [evidence], []

    async def fake_judge(self, chain, payload, expected_count, label, repair_attempts=1):
        calls.append(payload["requirements_block"])
        return ({"judgments": [
            {
                "requirement_index": i,
                "status": "MISSING_INFO",
                "justification": f"MISSING_INFO: evidence for requirement {i} is not sufficient.",
                "confidence": 0.75,
                "evidence_refs": [1],
                "missing_information": [f"Evidence for requirement {i}"],
                "recommended_action": f"Supply evidence for requirement {i}.",
            }
            for i in range(1, expected_count + 1)
        ]}, None)

    monkeypatch.setattr(evaluation_engine_module, "get_event_bus", lambda: _Bus())
    monkeypatch.setattr(evaluation_engine_module, "compare_requirement", lambda req, snapshot: {
        "version": 4, "requirementId": req.get("id"), "clauseRef": "7.1",
        "standardRequirement": req.get("text", ""), "coverage": "NONE", "decision": None,
        "method": "test_ambiguous", "confidence": 0.2, "elements": [],
        "reason": "No deterministic Product comparison is available.",
        "applicability": {"scope": "IN_SCOPE", "kind": "PRODUCT_OR_GENERAL", "confidence": 0.8, "reason": "Test requirement is in scope."},
    })
    monkeypatch.setattr(engine, "_retrieve_evidence", MethodType(fake_retrieve, engine))
    monkeypatch.setattr(engine, "_select_requirement_evidence", lambda requirement_text, supporting, limit=4: [0])
    monkeypatch.setattr(engine, "_judge_with_repair", MethodType(fake_judge, engine))

    rows = asyncio.run(engine._eval_clause_from_record(
        "evaluation-1", "company-1", record, ["product-doc"], "standard-doc",
        product_snapshot=object(),
    ))
    assert 3 <= len(calls) <= 14  # size and item limits may create more than three batches
    assert len(rows) == 14
    combined_prompt = "\n".join(calls)
    for i in range(1, 15):
        assert f"REQ-{i}" in combined_prompt
        assert f"END_REQUIREMENT_{i}" in combined_prompt
        assert any(row.requirement_id == f"REQ-{i}" for row in rows)
    assert all(row.status == "MISSING_INFO" for row in rows)


def test_model_cannot_reference_evidence_that_was_not_rendered_in_its_prompt():
    # Model refs are 1-based indexes into the rendered list, not the full retrieval
    # array. Out-of-range refs must be dropped rather than reinterpreted as globals.
    assert _resolve_evidence_reference_indexes([1, 2, 3], [9, 4], evidence_count=12) == [9, 4]
    assert _resolve_evidence_reference_indexes([3], [9, 4], evidence_count=12) == []
    assert _resolve_evidence_reference_indexes([1, 2, 2, "bad", 9], None, evidence_count=4) == [0, 1]


def test_event_bus_terminal_snapshot_and_sentinel_survive_a_full_queue():
    from app.services.event_bus import EventBus, _QUEUE_MAX

    async def exercise():
        bus = EventBus()
        sub = await bus.subscribe("finished-evaluation")
        await bus.publish("finished-evaluation", "started", total_clauses=2)
        await bus.publish("finished-evaluation", "verdict_emitted", clause_reference="7.1")
        await bus.publish("finished-evaluation", "engine_complete", conformity_score=91.0, summary="Complete")
        await bus.close("finished-evaluation")
        observed = []
        while True:
            event = await sub.get(timeout=1)
            if event is None:
                break
            observed.append(event)
        assert any(event.get("type") == "engine_complete" for event in observed)
        assert any(event.get("type") == "progress_snapshot" and event.get("done") is True for event in observed)

        slow = await bus.subscribe("slow-client")
        for i in range(_QUEUE_MAX):
            slow._queue.put_nowait({"type": "old", "n": i})
        await bus.publish("slow-client", "started", total_clauses=1)
        await bus.publish("slow-client", "engine_complete", conformity_score=100.0, summary="Complete")
        await bus.close("slow-client")
        tail = []
        while slow._queue.qsize():
            event = await slow.get(timeout=1)
            tail.append(event)
            if event is None:
                break
        assert tail[-1] is None
        assert any(isinstance(event, dict) and event.get("type") == "progress_snapshot" and event.get("done") is True for event in tail)

    asyncio.run(exercise())


def test_clause_timeout_scales_with_long_clauses_and_has_a_cap():
    # Six/seven batches now get adequate time for provider retries and repair calls;
    # short clauses retain the configured floor, and extremely long clauses cap out.
    assert _clause_timeout_for_requirement_count(6, base_timeout=480) == 480
    assert _clause_timeout_for_requirement_count(36, base_timeout=480) == 1440
    assert _clause_timeout_for_requirement_count(37, base_timeout=480) == 1680
    assert _clause_timeout_for_requirement_count(300, base_timeout=480) == 1800


def test_structured_clause_path_does_not_reference_missing_ref_context_helper():
    import inspect
    source = inspect.getsource(EvaluationEngine._eval_clause_from_record)
    assert "_ref_context_for" not in source


def test_explicit_leading_clause_reference_overrides_corrupt_parent_and_followups_inherit():
    payload = {
        "sections": [
            {
                "clauseNumber": "Clause 1",
                "heading": "Clause Part 1",
                "content": "FOREWORD\nCONTENTS\nINTRODUCTION\n" + ("General standard body text. " * 600),
            }
        ],
        "requirementsSummary": {
            "requirements": [
                {"id": "r1", "clauseRef": "Clause 1", "clauseTitle": "Clause Part 1", "text": "4.2.1 General Electrical components and devices shall be suitable for the intended use.", "type": "mandatory"},
                {"id": "r2", "clauseRef": "Clause 1", "clauseTitle": "Clause Part 1", "text": "The components shall be protected against foreseeable damage.", "type": "mandatory"},
                {"id": "r3", "clauseRef": "Clause 1", "clauseTitle": "Clause Part 1", "text": "4.4.1 General The electrical equipment shall be suitable for the environmental conditions.", "type": "mandatory"},
            ],
            "totalRequirements": 3,
        },
    }
    records = _structured_clause_records(payload)
    by_ref = {record.ref: record for record in records}
    assert "4.2.1" in by_ref
    assert "4.4.1" in by_ref
    assert "Clause 1" not in by_ref
    assert len(by_ref["4.2.1"].requirements) == 2
    assert by_ref["4.2.1"].requirements[0]["_clauseMappingMethod"] == "leading_reference_override"
    assert by_ref["4.2.1"].requirements[1]["_clauseMappingMethod"] == "sequential_clause_context"
    assert by_ref["4.2.1"].standard_quality_flags["sourceContextNeedsReview"] is True
    assert "FOREWORD" not in by_ref["4.2.1"].text


def test_anchored_clause_detector_avoids_measurements_and_finds_explicit_clauses():
    assert _leading_clause_reference("4.2.1 General Electrical components shall be suitable.") == "4.2.1"
    assert _leading_clause_reference("3.1.9 conduit shall be protected.") == "3.1.9"
    assert _leading_clause_reference("1.5 mm clearance should be provided.") is None
    assert _leading_clause_reference("Annex A.1 Normative references shall be recorded.") == "Annex A.1"


def test_low_confidence_clause_mapping_blocks_scoring():
    from app.services.evaluation_engine import _validate_standard_records_for_compliance

    record = ClauseRecord(
        ref="UNMAPPED",
        title="Unmapped requirement",
        text="The electrical equipment shall be protected.",
        section_type="clause",
        requirements=[
            {"id": f"req-{i}", "text": "The electrical equipment shall be protected.", "type": "mandatory", "_clauseMappingConfidence": 0.1, "_clauseMappingMethod": "unresolved_misattributed_section"}
            for i in range(4)
        ],
    )
    try:
        _validate_standard_records_for_compliance([record])
    except RuntimeError as exc:
        assert "mapping" in str(exc).lower() or "no auditable" in str(exc).lower()
    else:
        raise AssertionError("Unmapped normative requirements must not be scored")
