"""Functional smoke test for structure_openai._call_with_retry using a MOCKED
async client — verifies runtime JSON-retry flow without any network access."""
import asyncio
import unittest


class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)


class _Resp:
    def __init__(self, content):
        self.choices = [_Choice(content)]


class _FakeCompletions:
    def __init__(self, responses):
        self._responses = list(responses)   # list of content strings or Exception
        self.calls = []

    async def create(self, **kwargs):
        item = self._responses.pop(0)
        self.calls.append(kwargs)
        if isinstance(item, Exception):
            raise item
        return _Resp(item)


class _FakeClient:
    def __init__(self, responses):
        self.chat = type("chat", (), {"completions": _FakeCompletions(responses)})()


class TestCallWithRetryMocked(unittest.IsolatedAsyncioTestCase):
    def _run(self, responses, doc_type="PRODUCT_DOC"):
        from app.services import structure_openai as so
        client = _FakeClient(responses)
        fc = client.chat.completions
        return client, fc

    async def test_valid_response_passes_through(self):
        from app.services import structure_openai as so
        client, fc = self._run(['{"title": "X", "sections": [], "productProfile": {}}'])
        res = await so._call_with_retry(client, "m", {}, "PRODUCT_DOC", max_attempts=3)
        self.assertEqual(res.choices[0].message.content, '{"title": "X", "sections": [], "productProfile": {}}')
        self.assertEqual(len(fc.calls), 1)

    async def test_truncated_then_valid_retries(self):
        from app.services import structure_openai as so
        client, fc = self._run([
            '{"title": "X", "sections": [',   # truncated → triggers re-request
            '{"title": "OK", "sections": []}',
        ])
        res = await so._call_with_retry(client, "m", {}, "PRODUCT_DOC", max_attempts=3)
        self.assertEqual(len(fc.calls), 2)
        self.assertIn("OK", res.choices[0].message.content)

    async def test_all_truncated_raises_after_attempts(self):
        from app.services import structure_openai as so
        from app.services.json_robust import InvalidJSON
        client, fc = self._run(['{"a": ', '{"b": ', '{"c": '])
        with self.assertRaises(InvalidJSON):
            await so._call_with_retry(client, "m", {}, "PRODUCT_DOC", max_attempts=3)
        self.assertEqual(len(fc.calls), 3)   # bounded retries, does not exceed max


if __name__ == "__main__":
    unittest.main(verbosity=2)
