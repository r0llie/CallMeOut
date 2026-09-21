import unittest

from pump_callout import CalloutAPIError, CalloutDraft, PumpCalloutClient


class FakeClient(PumpCalloutClient):
    def __init__(self, eligibility):
        self.fixture = eligibility
        self.calls = []

    def _request(self, method, path, payload=None):
        self.calls.append((method, path, payload))
        if method == "GET":
            return self.fixture
        return {"callout": {"calloutId": "example"}}


class PublishTests(unittest.TestCase):
    def test_explicit_confirmation_and_preflight(self):
        client = FakeClient({
            "eligible": True,
            "preflight": {
                "create": {"verdict": "ELIGIBLE"},
                "postableAccounts": [{"verdict": "ELIGIBLE"}],
            },
        })
        draft = CalloutDraft("mint", "Original thesis")
        with self.assertRaises(ValueError):
            client.publish(draft)
        self.assertEqual([], client.calls)
        result = client.publish(draft, confirm=True)
        self.assertEqual("example", result["callout"]["calloutId"])
        self.assertEqual(("POST", "/callout/create", {
            "coinMint": "mint", "thesis": "Original thesis", "chainId": 1399811149, "version": 2,
        }), client.calls[-1])

    def test_existing_callout_never_posts(self):
        client = FakeClient({
            "eligible": False,
            "preflight": {"create": {"verdict": "EXISTING_CALLOUT"}},
        })
        with self.assertRaises(CalloutAPIError):
            client.publish(CalloutDraft("mint", "Thesis"), confirm=True)
        self.assertEqual(1, len(client.calls))


if __name__ == "__main__":
    unittest.main()
