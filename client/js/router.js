// ═══════════════════════════════════════════
// SecureChat — Hash-Based SPA Router
// ═══════════════════════════════════════════

window.Router = (function() {

  function navigate(path) {
    window.location.hash = '#/' + path;
  }

  function getCurrentPath() {
    const hash = window.location.hash.slice(2) || ''; // Remove '#/'
    return hash;
  }

  function parsePath(path) {
    const parts = path.split('/');
    const route = parts[0] || '';
    const param = parts[1] || null;
    return { route, param };
  }

  function render() {
    const path = getCurrentPath();
    const { route, param } = parsePath(path);

    const hasUser = !!SecureStorage.getUserId();

    switch (route) {
      case '':
      case 'welcome':
        if (hasUser) {
          Pages.home();
        } else {
          Pages.welcome();
        }
        break;

      case 'onboarding':
        Pages.onboarding();
        break;

      case 'home':
        if (!hasUser) {
          Pages.welcome();
        } else {
          Pages.home();
        }
        break;

      case 'create':
        if (!hasUser) { navigate('onboarding'); return; }
        Pages.createRoom();
        break;

      case 'join':
        if (!hasUser) { navigate('onboarding'); return; }
        Pages.joinRoom();
        break;

      case 'waiting':
        Pages.waitingRoom(param);
        break;

      case 'chat':
        if (!hasUser) { navigate('onboarding'); return; }
        Pages.chat(param);
        break;

      case 'settings':
        Pages.settings();
        break;

      default:
        if (hasUser) {
          Pages.home();
        } else {
          Pages.welcome();
        }
    }
  }

  function init() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { navigate, getCurrentPath, init };
})();
