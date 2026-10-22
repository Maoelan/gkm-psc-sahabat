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

    def capture(page, name):
        page.evaluate("document.activeElement?.blur(); window.scrollTo({top:0,left:0,behavior:'instant'})")
        page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
        page.screenshot(path=str(out / (name + '.png')), full_page=True)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), name
        assert page.get_by_role('heading', level=1).count() == 1, name
        for notice in page.locator('.live-notice strong').all():
            assert notice.evaluate('(el) => el.getBoundingClientRect().right <= el.parentElement.getBoundingClientRect().right'), name

    def send(text):
        reporter.locator('#chat-answer').fill(text)
        reporter.get_by_role('button', name='Kirim', exact=True).click()
        expect(reporter.locator('#chat-answer')).to_have_value('')

    for endpoint in ['/api/staff/reports', '/api/staff/recap', '/api/staff/chats', '/api/staff/recap/export', '/api/staff/reports/unknown/nik']:
        assert reporter_context.request.get(base + endpoint).status == 401, endpoint
    assert reporter_context.request.post(base + '/api/chat/session', headers={'Origin': 'https://outside.test'}, data={}).status == 403
    assert reporter_context.request.post(base + '/api/staff/chats/00000000-0000-4000-8000-000000000000/assistance', data={}).status == 401
    assert reporter_context.request.post(base + '/api/chat/session', data='x' * (128 * 1024 + 1), headers={'Content-Type': 'application/json'}).status == 413
    reporter.goto(base, wait_until='networkidle')
    expect(reporter.get_by_role('dialog', name='Selamat datang di PSC SAHABAT')).to_be_visible()
    capture(reporter, 'first-visit-mobile')
    reporter.get_by_role('button', name='Saya mengerti, lanjutkan').click()
    for width in [1440, 390, 320]:
        reporter.set_viewport_size({'width':width, 'height':844})
        capture(reporter, f'home-{width}')
    reporter.goto(base + '/edukasi', wait_until='networkidle')
    expect(reporter.locator('.education-types article')).to_have_count(6)
    capture(reporter, 'education-mobile')
    reporter.set_viewport_size({'width':390, 'height':844})
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
    reporter.get_by_text('Lengkapi data korban dan kejadian', exact=False).click()
    reporter.locator('#initial-birthDate').fill('2000-02-20')
    reporter.locator('#initial-parentName').fill('Orang Tua Uji')
    reporter.locator('#initial-address').fill('Alamat sintetis untuk pengujian')
    reporter.locator('#initial-gender').select_option('Perempuan')
    reporter.locator('#initial-coordination').select_option('Sudah')
    reporter.locator('#initial-coordinationDetails').fill('Latihan koordinasi dinas sosial')
    reporter.locator('input[type="checkbox"][value="physical"]').check()
    capture(reporter, 'optional-profile-mobile')
    reporter.get_by_text('Lengkapi data korban dan kejadian', exact=False).click()
    reporter.get_by_text('Isi NIK korban (opsional)', exact=True).click()
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

    assert reporter.locator('.message-log').bounding_box()['height'] >= 240
    capture(reporter, 'chat-guided-mobile')
    staff.goto(base + '/masuk?next=/petugas/percakapan', wait_until='networkidle')
    staff.locator('#username').fill(os.environ['E2E_USERNAME'])
    staff.locator('#password').fill(os.environ['E2E_PASSWORD'])
    staff.get_by_label('Tampilkan kata sandi').check()
    expect(staff.locator('#password')).to_have_attribute('type', 'text')
    staff.get_by_label('Tampilkan kata sandi').uncheck()
    staff.get_by_role('button', name='Masuk', exact=True).click()
    expect(staff).to_have_url(base + '/petugas/percakapan')
    staff.wait_for_load_state('networkidle')
    assert staff_context.request.post(base + '/api/staff/chats/00000000-0000-4000-8000-000000000000/assistance', data={}).status == 403
    staff.goto(base + '/petugas', wait_until='networkidle')
    expect(staff.get_by_text('Belum ada laporan yang masuk.', exact=True)).to_be_visible()
    capture(staff, 'queue-empty-desktop')
    staff.goto(base + '/petugas/percakapan', wait_until='networkidle')
    staff.locator('.active-row').filter(has_text='Saya juga diancam').click()
    expect(staff.get_by_role('heading', name='Percakapan pelapor', exact=True)).to_be_visible()
    reporter.bring_to_front()
    # Reporter does nothing: takeover and staff reply must arrive through polling.
    expect(reporter.get_by_role('button', name='Akhiri bantuan', exact=True)).to_be_visible()
    capture(staff, 'live-desktop')
    for width, height in [(390, 844), (320, 640)]:
        reporter.set_viewport_size({'width': width, 'height': height})
        assert reporter.locator('.message-log').bounding_box()['height'] >= 240
        assert reporter.locator('.message').count() > 1
        assert reporter.locator('.help-line').evaluate('(el) => el.getBoundingClientRect().bottom <= el.closest(".chat-card").getBoundingClientRect().bottom')
        capture(reporter, f'chat-handoff-{width}-{height}')
    reporter.set_viewport_size({'width':390, 'height':844})
    capture(reporter, 'chat-mobile')
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
    reporter.locator('.privacy-check input').check()
    capture(reporter, 'review-mobile')
    assert not reporter.evaluate('document.documentElement.scrollWidth > innerWidth')
    reporter.get_by_role('button', name='Konfirmasi dan kirim laporan', exact=True).click()
    expect(reporter.get_by_role('heading', name='Laporan terkirim', exact=True)).to_be_visible()
    reference = reporter.locator('.receipt-facts .num').inner_text()
    reporter_context.grant_permissions(['clipboard-read', 'clipboard-write'])
    reporter.get_by_role('button', name='Salin kode laporan', exact=True).click()
    expect(reporter.get_by_role('status')).to_contain_text('Kode laporan disalin.')
    assert reporter.evaluate('navigator.clipboard.readText()') == reference
    capture(reporter, 'receipt-mobile')
    staff.goto(base + '/petugas', wait_until='networkidle')
    expect(staff.locator('.queue-row')).to_have_count(1)
    staff.get_by_role('searchbox', name='Cari laporan').fill('tidak-ada-hasil')
    expect(staff.get_by_role('heading', name='Laporan tidak ditemukan')).to_be_visible()
    staff.get_by_role('button', name='Hapus pencarian dan filter').click()
    expect(staff.locator('.queue-row')).to_have_count(1)
    staff.get_by_label('Status laporan').select_option('decision_recorded')
    expect(staff.locator('.queue-row')).to_have_count(0)
    staff.get_by_label('Status laporan').select_option('all')
    staff.locator('.queue-row').click()
    for width in [1440, 1024, 768, 390, 320]:
        staff.set_viewport_size({'width': width, 'height': 960 if width == 1440 else 844})
        capture(staff, f'queue-detail-{width}')
    staff.set_viewport_size({'width': 390, 'height': 844})
    staff.get_by_role('button', name='Kembali ke antrean', exact=True).click()
    capture(staff, 'queue-mobile')
    staff.get_by_role('button', name='Buka menu', exact=True).click()
    expect(staff.get_by_role('dialog')).to_be_visible()
    staff.keyboard.press('Escape')
    expect(staff.get_by_role('dialog')).not_to_be_visible()
    expect(staff.get_by_role('button', name='Buka menu', exact=True)).to_be_focused()
    staff.set_viewport_size({'width':1440, 'height':960})
    staff.locator('.queue-row').click()
    staff.get_by_text('2. Tambahkan catatan pemeriksaan (bila perlu)', exact=True).click()
    staff.locator('#review-notes').fill('Perlu klarifikasi kebutuhan pendampingan.')
    staff.get_by_role('button', name='Simpan catatan', exact=True).click()
    expect(staff.locator('.report-detail')).to_contain_text('Sedang diperiksa')
    staff.locator('input[value="follow_up_required"]').check()
    staff.locator('#reason').fill('Perlu tindak lanjut berdasarkan keterangan pelapor.')
    staff.get_by_role('button', name='Simpan keputusan', exact=True).click()
    expect(staff.locator('.recorded-decision')).to_contain_text('Perlu tindak lanjut')
    staff.get_by_label('Status laporan').select_option('under_review')
    expect(staff.locator('.queue-row')).to_have_count(0)
    staff.get_by_label('Status laporan').select_option('all')
    expect(staff.locator('.queue-row')).to_have_count(1)
    capture(staff, 'queue-decided-desktop')
    staff.goto(base + '/rekap', wait_until='networkidle')
    expect(staff.locator('.recap-table')).to_contain_text(reference)
    expect(staff.get_by_role('link', name='1 laporan baru. Buka laporan masuk.')).to_be_visible()
    staff.get_by_role('searchbox', name='Cari laporan').fill('tidak-ada-hasil')
    expect(staff.get_by_role('heading', name='Tidak ada laporan pada filter ini')).to_be_visible()
    staff.get_by_role('button', name='Tampilkan semua', exact=True).click()
    capture(staff, 'recap-overview-desktop')
    staff.get_by_role('button', name='Lihat detail', exact=True).click()
    for width in [1440, 1024, 768, 390, 320]:
        staff.set_viewport_size({'width':width, 'height':960 if width == 1440 else 844})
        capture(staff, f'recap-{width}')
    staff.set_viewport_size({'width':1440, 'height':960})
    staff.get_by_role('button', name='Tampilkan NIK', exact=True).click()
    expect(staff.locator('.nik-value')).to_contain_text('0000 0000 0000 0001')
    staff.get_by_text('Data korban dan koordinasi', exact=True).click()
    expect(staff.locator('main')).to_contain_text('Latihan koordinasi dinas sosial')
    with staff.expect_download() as downloaded:
        staff.get_by_role('link', name='Unduh rekap Excel', exact=True).click()
    downloaded.value.save_as(str(out / 'rekap.xlsx'))
    import zipfile
    with zipfile.ZipFile(out / 'rekap.xlsx') as workbook:
        assert b'0000000000000001' not in workbook.read('xl/worksheets/sheet1.xml')
        assert b'0000000000000001' in workbook.read('xl/worksheets/sheet2.xml')
        assert b'Latihan koordinasi dinas sosial' in workbook.read('xl/worksheets/sheet2.xml')
    staff.goto(base + '/admin/nik', wait_until='networkidle')
    expect(staff).to_have_url(base + '/rekap')
    for width in [1440, 390, 320]:
        staff.set_viewport_size({'width':width, 'height':960 if width == 1440 else 844})
        capture(staff, f'nik-{width}')
    staff.set_viewport_size({'width':1440, 'height':960})
    # A second reporter supplies structured information entirely through the staff conversation.
    assisted_context = browser.new_context(viewport={'width':390, 'height':844})
    assisted_context.add_init_script("localStorage.setItem('psc-sahabat-intro-v1','read')")
    assisted = assisted_context.new_page()
    assisted.on('pageerror', lambda exc: errors.append(str(exc)))
    assisted.goto(base + '/chat?mode=operator', wait_until='networkidle')
    assisted.get_by_role('button', name='Ya, saya aman', exact=True).click()
    assisted.locator('input[value="Keluarga atau pendamping"]').check()
    # Victim identity is optional; this reporter deliberately leaves it blank.
    assisted.get_by_role('button', name='Mulai bercerita', exact=True).click()
    expect(assisted.locator('#chat-answer')).to_be_visible()
    assisted.locator('#chat-answer').fill('Latihan pendamping petugas: saya mengalami kekerasan oleh orang yang saya kenal.')
    assisted.get_by_role('button', name='Kirim', exact=True).click()
    expect(assisted.locator('#chat-answer')).to_have_value('')
    staff.goto(base + '/petugas/percakapan', wait_until='networkidle')
    staff.locator('.active-row').filter(has_text='Latihan pendamping petugas').click()
    panel = staff.get_by_role('complementary', name='Panduan petugas', exact=True)
    use_question = panel.get_by_role('button', name='Gunakan pertanyaan', exact=True)
    expect(use_question).to_be_enabled()
    posts = []
    staff.on('request', lambda req: posts.append(req.url) if req.method == 'POST' and req.url.endswith('/messages') else None)
    for topic, answer in [('incidentTime', 'Kemarin pagi'), ('incidentLocation', 'Di rumah'), ('need', 'Pendampingan petugas')]:
        expect(use_question).to_be_enabled()
        before = len(posts)
        use_question.click()
        question = staff.locator('#staff-reply').input_value()
        assert question and len(posts) == before, 'Suggested question must never auto-send'
        if topic == 'incidentTime':
            staff.locator('#staff-reply').fill('Untuk melengkapi catatan, ' + question)
        delivered = staff.locator('#staff-reply').input_value()
        staff.get_by_role('button', name='Kirim balasan', exact=True).click()
        assisted.bring_to_front()
        expect(assisted.get_by_text(delivered, exact=True)).to_be_visible()
        assisted.locator('#chat-answer').fill(answer)
        assisted.get_by_role('button', name='Kirim', exact=True).click()
        expect(assisted.locator('#chat-answer')).to_have_value('')
        expect(panel.locator('[data-topic="' + topic + '"]')).to_contain_text(answer)
        if topic == 'incidentTime':
            panel.locator('summary').click()
        if topic == 'incidentTime':
            capture(staff, 'staff-assistance-desktop')
            for width in [768,390,320]:
                staff.set_viewport_size({'width':width,'height':844})
                capture(staff, f'staff-assistance-{width}')
            staff.set_viewport_size({'width':1440,'height':960})
    expect(panel.locator('.complete-note')).to_be_visible()
    capture(staff, 'staff-assistance-complete')
    staff.get_by_role('button', name='Tutup percakapan', exact=True).click()
    assisted.bring_to_front()
    expect(assisted.get_by_role('button', name='Selesai dan periksa draf')).to_be_enabled()
    assisted.get_by_role('button', name='Selesai dan periksa draf').click()
    expect(assisted.get_by_label('Waktu kejadian', exact=True)).to_have_value('Kemarin pagi')
    expect(assisted.get_by_label('Lokasi umum', exact=True)).to_have_value('Di rumah')
    expect(assisted.get_by_label('Bantuan yang diharapkan', exact=True)).to_have_value('Pendampingan petugas')
    assisted.get_by_label('Waktu kejadian', exact=True).fill('Kemarin sekitar pukul delapan')
    assisted.wait_for_timeout(3800)
    expect(assisted.get_by_label('Waktu kejadian', exact=True)).to_have_value('Kemarin sekitar pukul delapan')
    assisted.locator('input[type="radio"][value="yes"]').check()
    assisted.locator('.privacy-check input').check()
    capture(assisted, 'assisted-review-mobile')
    assisted.get_by_role('button', name='Konfirmasi dan kirim laporan', exact=True).click()
    expect(assisted.locator('.submit-error')).to_contain_text('Tulis nomor HP Anda sebagai pelapor')
    assisted.locator('#contact-details').fill('0000-0000-0000, kontak sintetis pelapor; hanya siang hari')
    assisted.get_by_role('button', name='Konfirmasi dan kirim laporan', exact=True).click()
    expect(assisted.get_by_role('heading', name='Laporan terkirim', exact=True)).to_be_visible()
    assisted_reference = assisted.locator('.receipt-facts .num').inner_text()
    staff.goto(base + '/rekap', wait_until='networkidle')
    staff.get_by_role('searchbox', name='Cari laporan').fill(assisted_reference)
    staff.get_by_role('button', name='Lihat detail', exact=True).click()
    expect(staff.locator('.detail-facts')).to_contain_text('Kemarin sekitar pukul delapan')
    expect(staff.locator('.detail-facts')).to_contain_text('Pendampingan petugas')
    expect(staff.locator('main')).to_contain_text('Nama belum diisi')
    staff.get_by_role('button', name='Lihat kontak pelapor', exact=True).click()
    expect(staff.locator('.report-identity')).to_contain_text('0000-0000-0000')
    staff.get_by_role('button', name='Hapus laporan', exact=True).click()
    deletion = staff.get_by_role('dialog', name='Hapus laporan ini?')
    expect(deletion.get_by_role('button', name='Hapus permanen')).to_be_disabled()
    deletion.get_by_label('Ketik kode laporan untuk konfirmasi').fill('kode-salah')
    deletion.get_by_label('Alasan penghapusan').fill('Pembersihan data sintetis E2E')
    expect(deletion.get_by_role('button', name='Hapus permanen')).to_be_disabled()
    deletion.get_by_label('Ketik kode laporan untuk konfirmasi').fill(assisted_reference)
    capture(staff, 'delete-confirmation')
    deletion.get_by_role('button', name='Hapus permanen').click()
    expect(deletion).not_to_be_visible()
    expect(staff.locator('.recap-table')).not_to_contain_text(assisted_reference)
    assert staff_context.request.get(base + '/api/staff/reports/' + assisted_reference).status == 404
    assisted_context.close()
    staff.get_by_role('button', name='Keluar akun', exact=True).click()
    expect(staff).to_have_url(base + '/')
    assert staff_context.request.get(base + '/api/staff/reports').status == 401
    rate_context = browser.new_context()
    statuses = [rate_context.request.post(base + '/api/chat/session', data={}).status for _ in range(13)]
    assert 429 in statuses, statuses
    rate_context.close()
    assert not errors, errors
    print('E2E_OK: access/CSRF, limits, cookies/headers, chat/retry/handoff, report/recap/NIK/export, responsive navigation, decisions, receipt copy, private staff assistance, manual question editing, collected fields, preserved review edits and assisted recap')
    print('Artifacts:', out)
    browser.close()
