"""Requires Python + playwright + its Chromium browser. Uses the isolated E2E server."""
import os
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15000)
base = os.environ['E2E_BASE_URL']
out = Path(tempfile.mkdtemp(prefix='lapor-aman-e2e-'))
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    reporter_context = browser.new_context(viewport={'width': 390, 'height': 844})
    staff_context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    reporter = reporter_context.new_page()
    staff = staff_context.new_page()
    errors = []
    for page in [reporter, staff]:
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.set_default_timeout(15000)

    def send(text):
        reporter.locator('#chat-answer').fill(text)
        reporter.get_by_role('button', name='Kirim', exact=True).click()
        expect(reporter.locator('#chat-answer')).to_have_value('')

    for endpoint in ['/api/staff/reports', '/api/staff/recap', '/api/staff/chats', '/api/staff/recap/export', '/api/staff/reports/unknown/nik']:
        assert reporter_context.request.get(base + endpoint).status == 401, endpoint
    assert reporter_context.request.post(base + '/api/chat/session', headers={'Origin': 'https://outside.test'}, data={}).status == 403
    assert reporter_context.request.post(base + '/api/chat/session', data='x' * (128 * 1024 + 1), headers={'Content-Type': 'application/json'}).status == 413
    response = reporter.goto(base + '/chat?mode=operator', wait_until='networkidle')
    assert response.headers['x-frame-options'] == 'DENY'
    assert response.headers['referrer-policy'] == 'same-origin'
    assert 'no-store' in response.headers['cache-control']
    if os.environ.get('E2E_PRODUCTION') == 'true':
        assert "default-src 'self'" in response.headers.get('content-security-policy', '')
        assert "frame-ancestors 'none'" in response.headers.get('content-security-policy', '')
    reporter.get_by_role('button', name='Ya, saya aman', exact=True).click()
    reporter.locator('input[value="Diri sendiri"]').check()
    reporter.locator('#victim-name').fill('Korban Uji Browser')
    reporter.locator('#victim-nik').fill('0000000000000001')
    with reporter.expect_response(lambda response: '/api/chat/session' in response.url and response.request.method == 'POST') as session_created:
        reporter.get_by_role('button', name='Mulai bercerita', exact=True).click()
    session_payload = session_created.value.json()
    assert session_created.value.status == 201, session_payload.get('error')
    expect(reporter.locator('#chat-answer')).to_be_visible()
    session_cookie = next(cookie for cookie in reporter_context.cookies() if cookie['name'] == 'lapor_aman_session')
    assert session_cookie['httpOnly'] and session_cookie['sameSite'] == 'Strict'
    assert reporter_context.request.post(base + '/api/chat/draft', data={}).status == 403
    assert reporter_context.request.post(base + '/api/chat/draft', headers={'x-csrf-token': session_payload['csrfToken'], 'Content-Type': 'application/json'}, data=b'{invalid').status == 400
    assert reporter_context.request.get(base + '/api/staff/reports').status == 401
    send('Saya mengalami kekerasan oleh orang yang saya kenal.')
    # Side questions must not become the time field.
    send('Siapa yang bisa melihat laporan?')
    expect(reporter.locator('label[for="chat-answer"]')).to_have_text('Waktu kejadian')
    send('Kemarin sore')
    send('Di rumah')
    send('Saya ingin pendampingan petugas')
    send('Lengan saya juga terluka setelah kejadian.')

    # A failed request preserves the unsent text, and retry adds it exactly once.
    reporter.route('**/api/chat/turn', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Gangguan uji jaringan"}'))
    reporter.locator('#chat-answer').fill('Saya juga diancam setelah kejadian.')
    reporter.get_by_role('button', name='Kirim', exact=True).click()
    expect(reporter.locator('#chat-answer')).to_have_value('Saya juga diancam setelah kejadian.')
    expect(reporter.get_by_text('Gangguan uji jaringan', exact=True)).to_be_visible()
    reporter.unroute('**/api/chat/turn')
    reporter.get_by_role('button', name='Kirim', exact=True).click()
    expect(reporter.locator('#chat-answer')).to_have_value('')

    staff.goto(base + '/masuk?next=/petugas/percakapan', wait_until='networkidle')
    staff.locator('#username').fill(os.environ['E2E_USERNAME'])
    staff.locator('#password').fill(os.environ['E2E_PASSWORD'])
    staff.get_by_role('button', name='Masuk', exact=True).click()
    expect(staff).to_have_url(base + '/petugas/percakapan')
    staff.wait_for_load_state('networkidle')
    staff.locator('.active-row').filter(has_text='Saya juga diancam').click()
    expect(staff.get_by_role('heading', name='Percakapan pelapor', exact=True)).to_be_visible()
    reporter.bring_to_front()
    # Reporter does nothing: takeover and staff reply must arrive through polling.
    expect(reporter.get_by_role('button', name='Akhiri bantuan', exact=True)).to_be_visible()
    staff.locator('#staff-reply').fill('Silakan tambahkan keterangan yang ingin disampaikan.')
    staff.get_by_role('button', name='Kirim balasan', exact=True).click()
    reporter.bring_to_front()
    expect(reporter.get_by_text('Silakan tambahkan keterangan yang ingin disampaikan.', exact=True)).to_be_visible()
    send('Tetangga mendengar kejadian tersebut.')
    expect(staff.locator('.live-log')).to_contain_text('Tetangga mendengar kejadian tersebut.')
    staff.get_by_role('button', name='Tutup percakapan', exact=True).click()
    reporter.bring_to_front()
    expect(reporter.get_by_role('button', name='Selesai dan periksa draf')).to_be_enabled()
    reporter.get_by_role('button', name='Tutup', exact=True).click()
    expect(reporter.locator('.handoff-banner')).not_to_be_visible()
    staff.locator('.active-row').filter(has_text='Tetangga mendengar').click()
    reporter.bring_to_front()
    expect(reporter.get_by_role('button', name='Akhiri bantuan', exact=True)).to_be_visible()
    staff.get_by_role('button', name='Tutup percakapan', exact=True).click()
    reporter.bring_to_front()
    expect(reporter.get_by_role('button', name='Selesai dan periksa draf')).to_be_enabled()
    reporter.get_by_role('button', name='Selesai dan periksa draf').click()
    draft = reporter.locator('#review-story')
    text = draft.input_value()
    for detail in ['Lengan saya juga terluka', 'Saya juga diancam', 'Tetangga mendengar']:
        assert detail in text, detail
    assert text.count('Saya juga diancam') == 1
    assert 'Siapa yang bisa melihat' not in text
    reporter.locator('input[type="radio"][value="no"]').check()
    reporter.locator('input[type="checkbox"]').check()
    reporter.screenshot(path=str(out / 'review-mobile.png'), full_page=True)
    assert not reporter.evaluate('document.documentElement.scrollWidth > innerWidth')
    reporter.get_by_role('button', name='Konfirmasi dan kirim laporan', exact=True).click()
    expect(reporter.get_by_role('heading', name='Laporan terkirim', exact=True)).to_be_visible()
    reference = reporter.locator('.receipt-facts .num').inner_text()
    staff.goto(base + '/rekap', wait_until='networkidle')
    expect(staff.locator('.recap-table')).to_contain_text(reference)
    staff.get_by_role('button', name='Tampilkan NIK', exact=True).click()
    expect(staff.locator('.nik-value')).to_contain_text('0000 0000 0000 0001')
    with staff.expect_download() as downloaded:
        staff.get_by_role('link', name='Export .xlsx', exact=True).click()
    downloaded.value.save_as(str(out / 'rekap.xlsx'))
    import zipfile
    with zipfile.ZipFile(out / 'rekap.xlsx') as workbook:
        assert b'0000000000000001' not in workbook.read('xl/worksheets/sheet1.xml')
        assert b'0000000000000001' in workbook.read('xl/worksheets/sheet2.xml')
    staff.goto(base + '/admin/nik', wait_until='networkidle')
    expect(staff.locator('main')).to_contain_text('0000000000000001')
    staff.get_by_role('button', name='Keluar', exact=True).click()
    expect(staff).to_have_url(base + '/')
    assert staff_context.request.get(base + '/api/staff/reports').status == 401
    rate_context = browser.new_context()
    statuses = [rate_context.request.post(base + '/api/chat/session', data={}).status for _ in range(13)]
    assert 429 in statuses, statuses
    rate_context.close()
    assert not errors, errors
    print('E2E_OK: anonymous access, origin/CSRF, body limits, rate limits, cookies/headers, chat, failed request/retry, idle takeover, staff reply, repeat takeover, draft preservation, submission, recap, NIK and export')
    print('Artifacts:', out)
    browser.close()
