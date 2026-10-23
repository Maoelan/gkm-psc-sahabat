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
    reporter_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    staff_context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    reporter = reporter_context.new_page()
    staff = staff_context.new_page()
    errors = []
    for page in [reporter, staff]:
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.set_default_timeout(15000)

    def capture(page, name, reset=True):
        if reset: page.evaluate("document.activeElement?.blur(); window.scrollTo({top:0,left:0,behavior:'instant'})")
        page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
        page.screenshot(path=str(out / (name + '.png')), full_page=reset)
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
    expect(reporter.get_by_role('dialog', name='Selamat datang di Lapor Aman - PSC Sahabat')).to_be_visible()
    capture(reporter, 'first-visit-mobile')
    reporter.get_by_role('button', name='Saya mengerti, lanjutkan').click()
    expect(reporter.locator('.site-footer a')).to_have_count(1)
    expect(reporter.locator('.site-footer a')).to_have_text('Profil Puskesmas Suranadi')
    for width in [1440, 768, 430, 390, 360, 320]:
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
    expect(reporter.get_by_label('Nama korban atau nama panggilan (opsional)', exact=True)).to_be_visible()
    expect(reporter.get_by_label('NIK korban (opsional)', exact=True)).to_have_count(0)
    reporter.get_by_label('Nama korban atau nama panggilan (opsional)', exact=True).fill('Korban Uji Browser')
    capture(reporter, 'reporter-relation-mobile')
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
    send('Buatkan resep nasi goreng')
    expect(reporter.locator('.message-log')).to_contain_text('Saya hanya dapat membantu cerita kekerasan')
    # Side questions must not become the time field.
    send('Siapa yang bisa melihat laporan?')
    expect(reporter.locator('label[for="chat-answer"]')).to_have_text('Waktu kejadian')
    expect(reporter.get_by_role('button', name='Kemarin', exact=True)).to_be_visible()
    capture(reporter, 'quick-answers-visible-mobile')
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

    assert reporter.locator('.message-log').bounding_box()['height'] >= 200
    capture(reporter, 'chat-guided-mobile')
    reporter.locator('.chat-tools summary').click()
    capture(reporter, 'chat-help-mobile')
    reporter.locator('.chat-tools summary').click()
    reporter.set_viewport_size({'width':390,'height':420})
    reporter.locator('#chat-answer').focus()
    expect(reporter.locator('#chat-answer')).to_be_in_viewport(ratio=0.75)
    assert reporter.locator('#chat-answer').evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') >= 16
    capture(reporter, 'chat-short-viewport',False)
    reporter.set_viewport_size({'width':844,'height':390})
    capture(reporter, 'chat-landscape')
    reporter.set_viewport_size({'width':390,'height':844})
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
    staff.set_viewport_size({'width':390,'height':844})
    capture(staff,'staff-chat-collapsed-mobile')
    staff.locator('#staff-reply').focus()
    expect(staff.locator('#staff-reply')).to_be_in_viewport(ratio=0.75)
    staff.set_viewport_size({'width':390,'height':420})
    staff.locator('#staff-reply').focus()
    expect(staff.locator('#staff-reply')).to_be_in_viewport(ratio=0.75)
    capture(staff,'staff-short-viewport',False)
    staff.set_viewport_size({'width':1440,'height':1000})
    for width, height in [(390, 844), (320, 640)]:
        reporter.set_viewport_size({'width': width, 'height': height})
        assert reporter.locator('.message-log').bounding_box()['height'] >= 200
        assert reporter.locator('.message').count() > 1
        assert reporter.locator('.help-line').evaluate('(el) => el.getBoundingClientRect().bottom <= el.closest(".chat-card").getBoundingClientRect().bottom')
        capture(reporter, f'chat-handoff-{width}-{height}')
    reporter.set_viewport_size({'width':390, 'height':844})
    capture(reporter, 'chat-mobile')
    staff.locator('#staff-reply').fill('Silakan tambahkan keterangan yang ingin disampaikan.')
    staff.locator('#staff-reply').press('Shift+Enter')
    expect(staff.locator('#staff-reply')).to_have_value('Silakan tambahkan keterangan yang ingin disampaikan.\n')
    staff.locator('#staff-reply').press('Enter')
    expect(staff.locator('#staff-reply')).to_have_value('')
    reporter.bring_to_front()
    expect(reporter.get_by_text('Silakan tambahkan keterangan yang ingin disampaikan.', exact=True)).to_be_visible()
    send('Tetangga mendengar kejadian tersebut.')
    expect(staff.locator('.live-log')).to_contain_text('Tetangga mendengar kejadian tersebut.')
    staff.get_by_role('button', name='Akhiri bantuan', exact=True).click()
    reporter.bring_to_front()
    expect(reporter.get_by_role('button', name='Selesai dan periksa draf')).to_be_enabled()
    reporter.get_by_role('button', name='Tutup', exact=True).click()
    expect(reporter.locator('.handoff-banner')).not_to_be_visible()
    staff.locator('.active-row').filter(has_text='Tetangga mendengar').click()
    reporter.bring_to_front()
    expect(reporter.get_by_role('button', name='Akhiri bantuan', exact=True)).to_be_visible()
    staff.get_by_role('button', name='Akhiri bantuan', exact=True).click()
    reporter.bring_to_front()
    expect(reporter.get_by_role('button', name='Selesai dan periksa draf')).to_be_enabled()
    reporter.get_by_role('button', name='Selesai dan periksa draf').click()
    reporter.get_by_text('Lengkapi data korban', exact=False).click()
    expect(reporter.locator('.review-name')).to_contain_text('Korban Uji Browser')
    expect(reporter.get_by_label('Nama korban', exact=True)).to_have_count(0)
    expect(reporter.locator('#review-nik-help')).to_have_count(0)
    reporter.locator('#review-nik').fill('0000000000000001')
    reporter.locator('#review-birthDate').fill('2000-02-20')
    reporter.locator('#review-parentName').fill('Orang Tua Uji')
    reporter.locator('#review-address').fill('Alamat sintetis untuk pengujian')
    reporter.locator('#review-gender').select_option('Perempuan')
    reporter.locator('#review-coordination').select_option('Sudah')
    reporter.locator('#review-coordinationDetails').fill('Latihan koordinasi dinas sosial')
    reporter.locator('input[type="checkbox"][value="physical"]').check()
    capture(reporter, 'optional-profile-mobile')
    reporter.get_by_text('Lengkapi data korban', exact=False).click()
    draft = reporter.locator('#review-story')
    text = draft.input_value()
    for detail in ['Lengan saya juga terluka', 'Saya juga diancam', 'Tetangga mendengar']:
        assert detail in text, detail
    assert text.count('Saya juga diancam') == 1
    assert 'Siapa yang bisa melihat' not in text
    assert 'Buatkan resep' not in text
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
    for width in [1440, 1024, 768, 430, 390, 360, 320]:
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
    for width in [1440, 1024, 768, 430, 390, 360, 320]:
        staff.set_viewport_size({'width':width, 'height':960 if width == 1440 else 844})
        capture(staff, f'recap-{width}')
    staff.set_viewport_size({'width':1440, 'height':960})
    expect(staff.locator('.report-identity')).to_contain_text('0000 0000 0000 0001')
    staff.get_by_text('Data korban dan koordinasi', exact=True).click()
    expect(staff.locator('main')).to_contain_text('Latihan koordinasi dinas sosial')
    with staff.expect_download() as downloaded:
        staff.get_by_role('link', name='Unduh rekap Excel', exact=True).click()
    downloaded.value.save_as(str(out / 'rekap.xlsx'))
    import zipfile
    with zipfile.ZipFile(out / 'rekap.xlsx') as workbook:
        assert b'0000000000000001' in workbook.read('xl/worksheets/sheet1.xml')
        assert b'Latihan koordinasi dinas sosial' in workbook.read('xl/worksheets/sheet1.xml')
        assert b'Tetangga mendengar' in workbook.read('xl/worksheets/sheet1.xml')
        assert b'Kronologi lengkap' in workbook.read('xl/worksheets/sheet1.xml')
    staff.goto(base + '/admin/nik', wait_until='networkidle')
    expect(staff).to_have_url(base + '/rekap')
    for width in [1440, 768, 430, 390, 360, 320]:
        staff.set_viewport_size({'width':width, 'height':960 if width == 1440 else 844})
        capture(staff, f'nik-{width}')
    staff.set_viewport_size({'width':1440, 'height':960})
    # A second reporter supplies structured information entirely through the staff conversation.
    assisted_context = browser.new_context(viewport={'width':390, 'height':844}, is_mobile=True, has_touch=True)
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
    expect(panel.get_by_role('button', name='Gunakan pertanyaan', exact=True)).not_to_be_visible()
    panel.get_by_text('Bantu susun pertanyaan', exact=True).click()
    use_question = panel.get_by_role('button', name='Gunakan pertanyaan', exact=True)
    expect(use_question).to_be_enabled()
    posts = []
    staff.on('request', lambda req: posts.append(req.url) if req.method == 'POST' and req.url.endswith('/messages') else None)
    for topic, answer in [('incidentTime', 'Kemarin pagi'), ('incidentLocation', 'Di rumah'), ('need', 'Pendampingan petugas')]:
        if not use_question.is_visible(): panel.get_by_text('Bantu susun pertanyaan', exact=True).click()
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
        panel.get_by_text('Bantu susun pertanyaan', exact=True).click()
        if topic == 'incidentTime':
            panel.get_by_text('Lihat kelengkapan dan kutipan pelapor', exact=True).click()
        if topic == 'incidentTime':
            capture(staff, 'staff-assistance-desktop')
            for width in [768,430,390,360,320]:
                staff.set_viewport_size({'width':width,'height':844})
                capture(staff, f'staff-assistance-{width}')
            staff.set_viewport_size({'width':1440,'height':960})
    expect(panel.locator('.complete-note')).to_be_visible()
    assisted.locator('#chat-answer').fill('Tambahan sintetis yang belum dikirim.')
    capture(staff, 'staff-assistance-complete')
    staff.get_by_role('button', name='Hentikan percakapan pelapor', exact=True).click()
    end_dialog = staff.get_by_role('dialog', name='Hentikan percakapan pelapor?')
    expect(end_dialog).to_be_visible()
    end_dialog.get_by_role('button', name='Batal', exact=True).click()
    expect(staff.locator('#staff-reply')).to_be_enabled()
    staff.get_by_role('button', name='Hentikan percakapan pelapor', exact=True).click()
    capture(staff, 'admin-stop-confirmation')
    end_dialog.get_by_role('button', name='Hentikan percakapan', exact=True).click()
    expect(end_dialog).not_to_be_visible()
    assisted.bring_to_front()
    expect(assisted.get_by_role('button', name='Kembali ke chat', exact=True)).to_be_disabled()
    expect(assisted.locator('#chat-answer')).not_to_be_visible()
    expect(assisted.get_by_label('Pesan yang belum terkirim', exact=True)).to_have_value('Tambahan sintetis yang belum dikirim.')
    capture(assisted, 'admin-stopped-reporter-review')
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
    expect(staff.locator('.report-identity')).to_contain_text('0000-0000-0000')
    staff.get_by_text('Tindakan laporan', exact=True).click()
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
    mobile_staff_context = browser.new_context(storage_state=staff_context.storage_state(), viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    mobile_staff = mobile_staff_context.new_page()
    for route in ['/petugas','/rekap','/petugas/percakapan']:
        mobile_staff.goto(base+route,wait_until='networkidle')
        expect(mobile_staff.get_by_role('navigation',name='Menu petugas',exact=True)).to_be_visible()
        capture(mobile_staff,'touch-staff-'+route.rsplit('/',1)[-1])
    mobile_staff_context.close()
    staff.get_by_role('button', name='Keluar akun', exact=True).click()
    expect(staff).to_have_url(base + '/')
    assert staff_context.request.get(base + '/api/staff/reports').status == 401
    assert not errors, errors
    print('E2E_OK: access/CSRF, limits, cookies/headers, chat/retry/handoff, report/recap/NIK/export, responsive navigation, decisions, receipt copy, private staff assistance, manual question editing, collected fields, preserved review edits and assisted recap')
    print('Artifacts:', out)
    # Actual fallback must retain earlier facts, and polling must not reset a model-selected topic.
    for relation in ['Diri sendiri', 'Keluarga atau pendamping', 'Pihak lain yang mengetahui kejadian']:
        context = browser.new_context(viewport={'width':390, 'height':844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.goto(base + '/chat', wait_until='networkidle')
        welcome = page.get_by_role('button', name='Saya mengerti, lanjutkan')
        if welcome.is_visible(): welcome.click()
        page.get_by_role('button', name='Ya, saya aman', exact=True).click()
        page.locator('input[value="' + relation + '"]').check()
        with page.expect_response(lambda r: '/api/chat/session' in r.url and r.request.method == 'POST') as context_session:
            page.get_by_role('button', name='Mulai bercerita', exact=True).click()
        assert context_session.value.status == 201, context_session.value.text()
        expect(page.locator('#chat-answer')).to_be_visible()
        first = 'Saya mengalami kekerasan dirumah' if relation == 'Diri sendiri' else 'Anak tetangga mengalami kekerasan dirumah'
        page.locator('#chat-answer').fill(first)
        with page.expect_response(lambda r: '/api/chat/turn' in r.url and r.request.method == 'POST') as first_turn:
            page.get_by_role('button', name='Kirim', exact=True).click()
        assert first_turn.value.request.post_data_json['relation'] == relation
        assert first_turn.value.json()['fields']['incidentLocation'] == 'dirumah'
        expect(page.locator('label[for="chat-answer"]')).to_have_text('Waktu kejadian')
        detail = 'Kejadian itu terjadi hari ini, kekerasan dilakukan paman, setelah dirumah paman tiba-tiba memuluk kepala menggunakan gagang sapu, katanya gara-gara lupa mencuci piring tadi pagi.'
        page.locator('#chat-answer').fill(detail)
        page.get_by_role('button', name='Kirim', exact=True).click()
        expect(page.locator('label[for="chat-answer"]')).to_have_text('Bantuan yang diharapkan')
        expect(page.get_by_role('button', name='Pendampingan', exact=True)).to_be_visible()
        page.wait_for_timeout(4200)
        expect(page.locator('label[for="chat-answer"]')).to_have_text('Bantuan yang diharapkan')
        expect(page.get_by_role('button', name='Rumah', exact=True)).to_have_count(0)
        capture(page, 'context-retained-' + str(['Diri sendiri', 'Keluarga atau pendamping', 'Pihak lain yang mengetahui kejadian'].index(relation)))
        if relation != 'Diri sendiri':
            assert 'Anda mengalami kekerasan' not in page.locator('.message-log').inner_text()
        # A legitimate next question may be selected out of the default field order.
        page.route('**/api/chat/turn', lambda route: route.fulfill(json={
            'userMessageId':'synthetic-topic-test', 'flowComplete':False, 'source':'nvidia',
            'fields':{'incidentTime':'hari ini', 'incidentLocation':'', 'need':''},
            'missingField':'need', 'message':'Bantuan apa yang ingin diajukan?', 'question':'Bantuan apa yang ingin diajukan?'
        }))
        page.locator('#chat-answer').fill('Saya masih takut')
        page.get_by_role('button', name='Kirim', exact=True).click()
        expect(page.locator('#chat-answer')).to_have_value('')
        page.wait_for_timeout(4200)
        expect(page.locator('label[for="chat-answer"]')).to_have_text('Bantuan yang diharapkan')
        expect(page.get_by_role('button', name='Pendampingan', exact=True)).to_be_visible()
        context.close()
    print('E2E_CONTEXT_OK: narrative recovery, reporter roles, consistent questions and quick answers after polling')
    rate_context = browser.new_context()
    statuses = [rate_context.request.post(base + '/api/chat/session', data={}).status for _ in range(13)]
    assert 429 in statuses, statuses
    rate_context.close()
    assert not errors, errors
    browser.close()
