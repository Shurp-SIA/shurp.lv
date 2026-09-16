import asyncio
import unittest

from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from server.app import app


class SiteRoutesTests(unittest.TestCase):
    def test_clean_legal_routes_work_without_apache(self):
        with TestClient(app) as client:
            for locale in ('lv', 'en'):
                for page in ('privacy', 'terms', 'help', 'tutorial'):
                    response = client.get(f'/{locale}/{page}')
                    self.assertEqual(response.status_code, 200)
                    self.assertIn('text/html', response.headers['content-type'])
            self.assertEqual(client.get('/get').status_code, 200)
            self.assertEqual(client.get('/en/privacy.html').status_code, 200)
            self.assertEqual(client.get('/assets/js/analytics.js').status_code, 200)
            self.assertEqual(client.get('/xx/privacy').status_code, 404)
            self.assertEqual(client.get('/en/nonexistent').status_code, 404)
            self.assertEqual(client.get('/api/analytics/report').status_code, 404)

    def test_only_configured_proxy_can_supply_visitor_address(self):
        async def resolve(peer, trusted):
            result = {}
            async def endpoint(scope, receive, send):
                result.update(client=scope['client'][0], scheme=scope['scheme'])
            scope = {'type': 'http', 'client': (peer, 12345), 'scheme': 'http', 'headers': [
                (b'x-forwarded-for', b'198.51.100.12'), (b'x-forwarded-proto', b'https')]}
            await ProxyHeadersMiddleware(endpoint, trusted_hosts=trusted)(scope, None, None)
            return result
        self.assertEqual(asyncio.run(resolve('10.0.0.2', '10.0.0.2')), {'client': '198.51.100.12', 'scheme': 'https'})
        self.assertEqual(asyncio.run(resolve('10.0.0.3', '10.0.0.2')), {'client': '10.0.0.3', 'scheme': 'http'})
        self.assertEqual(asyncio.run(resolve('10.0.0.2', '')), {'client': '10.0.0.2', 'scheme': 'http'})
