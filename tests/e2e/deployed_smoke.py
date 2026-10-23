"""Explicit hosted evaluation smoke test. Creates one clearly marked synthetic report."""
import os
import sys
import tempfile
import uuid
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ['EVALUATION_BASE_URL'].rstrip('/')
if not base.startswith('https://') or os.environ.get('ALLOW_EVALUATION_WRITE') != 'true':
    raise SystemExit('Explicit HTTPS evaluation target and write opt-in are required.')
output = Path(tempfile.mkdtemp(prefix='lapor-hosted-smoke-'))
stage = 'initialization'
try:
    with sync_playwright() as p:
        expect.set_options(timeout=60000)
        browser = p.chromium.launch(headless=True)
        reporter = browser.new_context(viewport={'width': 390, 'height': 844})
        staff = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = staff.new_page()
        page.set_default_timeout(60000)
        stage = 'public access and headers'
        home = reporter.new_page()
        response = home.goto(base, wait_until='domcontentloaded')
        assert response.status == 200
        assert response.headers.get('x-frame-options') == 'DENY'
        assert 'no-store' in response.headers.get('cache-control', '')
        assert "frame-ancestors 'none'" in response.headers.get('content-security-policy', '')
        assert reporter.request.get(base + '/api/health').json() == {'status': 'ok'}
        assert reporter.request.get(base + '/api/staff/reports').status == 401
        assert reporter.request.post(base + '/api/chat/session', headers={'Origin': 'https://outside.example.test'}, data={}).status == 403
        expect(home.get_by_role('dialog', name='Selamat datang di Lapor Aman - PSC')).to_be_visible()
        home.screenshot(path=str(output / 'evaluation-intro-mobile.png'), full_page=True)
        home.get_by_role('button', name='Saya mengerti, lanjutkan').click()
        expect(home.get_by_role('heading', level=1)).to_have_text('Lapor Aman - PSC')
        home.screenshot(path=str(output / 'evaluation-home-mobile.png'), full_page=True)
        home.goto(base + '/edukasi', wait_until='domcontentloaded')
        expect(home.locator('.education-types article')).to_have_count(6)
        home.screenshot(path=str(output / 'evaluation-education-mobile.png'), full_page=True)

        stage = 'reporter session and provider turn'
        session_response = reporter.request.post(base + '/api/chat/session', headers={'Origin': base}, data={})
        assert session_response.status == 201
        token = session_response.json()['csrfToken']
        reporter_headers = {'Origin': base, 'x-csrf-token': token}
        cookie = next(c for c in reporter.cookies() if c['name'] == 'lapor_aman_session')
        assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
        marker = 'Data sintetis untuk uji deployment ' + uuid.uuid4().hex[:8]
        narrative = marker + '. Ini percakapan latihan untuk menguji alur bantuan petugas pada sistem evaluasi.'
        turn = reporter.request.post(base + '/api/chat/turn', headers=reporter_headers, data={'story': narrative, 'userMessage': narrative}, timeout=60000)
        assert turn.status == 200

        stage = 'staff login'
        page.goto(base + '/masuk?next=/petugas/percakapan', wait_until='domcontentloaded')
        page.locator('#username').fill('admin')
        page.locator('#password').fill(os.environ['DEMO_STAFF_ADMIN_PASSWORD'])
        page.get_by_role('button', name='Masuk', exact=True).click()
        expect(page).to_have_url(base + '/petugas/percakapan')
        staff_cookie = next(c for c in staff.cookies() if c['name'] == 'lapor_aman_staff')
        assert staff_cookie['secure'] and staff_cookie['httpOnly']
        csrf = page.locator('.workspace-account input[name="csrfToken"]').input_value()
        staff_headers = {'Origin': base, 'x-csrf-token': csrf}
        assert staff.request.post(base + '/api/staff/chats/00000000-0000-4000-8000-000000000000/assistance', data={}).status == 403

        stage = 'takeover and editable private guidance'
        page.locator('.active-row').filter(has_text=marker).click()
        panel = page.get_by_role('complementary', name='Panduan petugas')
        panel.get_by_text('Bantu susun pertanyaan', exact=True).click()
        use = panel.get_by_role('button', name='Gunakan pertanyaan', exact=True)
        expect(use).to_be_enabled()
        sent = []
        page.on('request', lambda req: sent.append(req.url) if req.method == 'POST' and '/messages' in req.url else None)
        use.click()
        assert page.locator('#staff-reply').input_value().strip()
        assert not sent
        page.locator('#staff-reply').fill('Kapan kira-kira kejadian itu terjadi?')
        page.locator('#staff-reply').press('Enter')
        expect(page.locator('#staff-reply')).to_have_value('')
        reply = reporter.request.post(base + '/api/chat/handoff/messages', headers=reporter_headers, data={'body': 'Kemarin sore'})
        assert reply.status in [200, 201]
        expect(page.locator('.live-log')).to_contain_text('Kemarin sore')
        page.screenshot(path=str(output / 'evaluation-staff-guidance.png'), full_page=True)
        page.get_by_role('button', name='Hentikan percakapan pelapor', exact=True).click()
        confirmation = page.get_by_role('dialog', name='Hentikan percakapan pelapor?')
        expect(confirmation).to_be_visible()
        confirmation.get_by_role('button', name='Batal', exact=True).click()
        expect(page.locator('#staff-reply')).to_be_enabled()
        page.get_by_role('button', name='Hentikan percakapan pelapor', exact=True).click()
        confirmation.get_by_role('button', name='Hentikan percakapan', exact=True).click()
        expect(confirmation).not_to_be_visible()
        expect(page.locator('.live-status-note')).to_contain_text('ditutup')
        collected = reporter.request.get(base + '/api/chat/handoff').json()
        assert collected['collectedFields']['incidentTime'] == 'Kemarin sore'
        assert collected['conversationEnded'] is True
        assert reporter.request.post(base + '/api/chat/turn', headers=reporter_headers, data={'story': narrative, 'userMessage': 'Pesan sintetis setelah admin menghentikan chat.'}).status == 409
        assert reporter.request.post(base + '/api/chat/handoff/messages', headers=reporter_headers, data={'body': 'Pesan sintetis setelah admin menghentikan chat.'}).status == 409

        stage = 'draft and idempotent submission'
        draft_input = {'victimName': 'Uji Deployment (Data Sintetis)', 'victimNik': '0000000000000001', 'relation': 'Diri sendiri', 'story': narrative, 'incidentTime': 'Kemarin sore', 'incidentLocation': 'Rumah simulasi', 'need': 'Pendampingan petugas (latihan)', 'safeContact': 'no', 'contactDetails': ''}
        draft_input['profile'] = {'birthDate':'2000-02-20', 'coordination':'Sudah', 'coordinationDetails':'Koordinasi sintetis untuk pengujian', 'violenceTypes':['physical','psychological']}
        draft = reporter.request.post(base + '/api/chat/draft', headers=reporter_headers, data=draft_input)
        assert draft.status == 201
        submit = {**draft.json(), 'idempotencyKey': str(uuid.uuid4()), 'privacyRead': True, 'noticeVersion': '2026-10-22'}
        submitted = reporter.request.post(base + '/api/reports', headers=reporter_headers, data=submit)
        assert submitted.status == 201
        result = submitted.json()
        assert reporter.request.post(base + '/api/reports', headers=reporter_headers, data=submit).json() == result
        reference = result['referenceCode']

        stage = 'decision, identity, transcript and export permissions'
        prefix = base + '/api/staff/reports/' + reference
        assert reporter.request.get(prefix + '/nik').status == 401
        assert staff.request.get(prefix + '/nik').json()['nik'] == '0000000000000001'
        assert staff.request.get(prefix).json()['report']['profile']['coordinationDetails'] == 'Koordinasi sintetis untuk pengujian'
        assert staff.request.get(prefix + '/contact').json()['contact'] is None
        assert reference in [r['referenceCode'] for r in staff.request.get(base + '/api/staff/notifications').json()['reports']]
        assert any('Kemarin sore' in m['body'] for m in staff.request.get(prefix + '/chat').json()['messages'])
        decision = staff.request.post(prefix + '/decision', headers=staff_headers, data={'decision': 'follow_up_not_required', 'reason': 'Data sintetis untuk pemeriksaan deployment, bukan laporan kejadian nyata.'})
        assert decision.status == 200
        exported = staff.request.get(base + '/api/staff/recap/export')
        assert exported.status == 200
        import io, zipfile
        with zipfile.ZipFile(io.BytesIO(exported.body())) as workbook:
            sheet = workbook.read('xl/worksheets/sheet1.xml')
            assert b'0000000000000001' in sheet
            assert narrative.encode() in sheet
            assert b'Kronologi lengkap' in sheet
            assert b'Koordinasi sintetis untuk pengujian' in sheet
        assert reporter.request.get(base + '/api/staff/recap/export').status == 401

        stage = 'deployed summary and logout'
        page.goto(base + '/rekap', wait_until='domcontentloaded')
        page.get_by_role('searchbox', name='Cari laporan').fill(reference)
        expect(page.locator('.recap-table')).to_contain_text('Uji Deployment (Data Sintetis)')
        page.screenshot(path=str(output / 'evaluation-recap-desktop.png'), full_page=True)
        stage = 'confirmed deletion of this smoke test record only'
        page.get_by_role('button', name='Lihat detail', exact=True).click()
        expect(page.locator('.report-identity')).to_contain_text('0000 0000 0000 0001')
        page.get_by_text('Tindakan laporan', exact=True).click()
        page.get_by_role('button', name='Hapus laporan', exact=True).click()
        deletion = page.get_by_role('dialog', name='Hapus laporan ini?')
        expect(deletion.get_by_role('button', name='Hapus permanen')).to_be_disabled()
        deletion.get_by_label('Ketik kode laporan untuk konfirmasi').fill(reference)
        deletion.get_by_label('Alasan penghapusan').fill('Pembersihan laporan sintetis dari uji deployment ini.')
        deletion.get_by_role('button', name='Hapus permanen').click()
        expect(deletion).not_to_be_visible()
        assert staff.request.get(prefix).status == 404
        stage = 'logout'
        logout = staff.request.post(base + '/api/staff/logout', headers=staff_headers, data={})
        assert logout.status in [200, 204]
        assert staff.request.get(base + '/api/staff/reports').status == 401
        reporter.request.delete(base + '/api/chat/session', headers=reporter_headers)
        browser.close()
        print('HOSTED_SMOKE_OK: HTTPS, security headers, session cookies, staff login, private guidance, manual sending, finalized fields, idempotent submission, decision, NIK, transcript, education, notifications, export, confirmed deletion and logout.')
        print('Deleted synthetic evaluation reference: ' + reference)
        print('Artifacts: ' + str(output))
except Exception as error:
    line = next((frame.lineno for frame in reversed(traceback.extract_tb(error.__traceback__)) if frame.filename.endswith('deployed_smoke.py')), 0)
    print('HOSTED_SMOKE_FAILED: ' + stage + ' (' + type(error).__name__ + ', script line ' + str(line) + '). Private details withheld.', file=sys.stderr)
    raise SystemExit(1)
