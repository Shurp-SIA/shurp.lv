(function () {
    const english = new URLSearchParams(location.search).get('lang') === 'en';
    const locale = english ? 'en' : 'lv';
    document.documentElement.lang = locale;
    document.querySelector('[data-home]').href = '/' + locale + '/';
    document.querySelectorAll('[data-language]').forEach(link => {
        if (link.dataset.language === locale) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    if (english) {
        document.getElementById('join-title').textContent = "Join your company's Shurp carpool programme";
        document.getElementById('join-message').textContent = 'Install or update the Shurp app. Then open this link again or scan the QR code again — the app will connect you to your company.';
        document.getElementById('current-language').textContent = 'EN';
        document.getElementById('language').setAttribute('aria-label', 'Language');
        document.querySelector('[data-nav-trigger]').setAttribute('aria-label', 'Language');
        document.getElementById('ios-badge').src = '/assets/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg';
        document.getElementById('ios-badge').alt = 'Download on the App Store';
        document.getElementById('android-badge').src = '/assets/GetItOnGooglePlay_Badge_Web_color_English.svg';
        document.getElementById('android-badge').alt = 'Get it on Google Play';
        document.getElementById('copyright').textContent = '© 2026 SHURP. All rights reserved.';
        document.getElementById('privacy').textContent = 'Privacy Policy';
        document.getElementById('terms').textContent = 'Terms of Service';
        document.getElementById('privacy').href = '/en/privacy';
        document.getElementById('terms').href = '/en/terms';
    }
    document.title = document.getElementById('join-title').textContent;

    // Match the app's parseCompanyCode normalization and ten-character alphabet.
    const match = location.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (!match) return;
    let code;
    try { code = decodeURIComponent(match[1]); } catch (_) { return; }
    code = code.trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(code)) return;
    const label = document.getElementById('company-code');
    label.textContent = (english ? 'Company code: ' : 'Uzņēmuma kods: ') + code;
    label.hidden = false;
})();
