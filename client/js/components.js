window.SecureIcons = {
  getSvg(name, color = 'currentColor', size = '1.2em') {
    const paths = {
      lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
      eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
      'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
      chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
      key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>',
      door: '<path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>',
      ban: '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>',
      dashboard: '<rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect>',
      broadcast: '<path d="M12 19V5H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7z"></path><path d="M12 5h3l6 4v6l-6 4h-3"></path><line x1="23" y1="12" x2="21" y2="12"></line><line x1="3" y1="19" x2="6" y2="21"></line>',
      clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
      'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
      'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
      clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
      send: '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>',
      plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
      alert: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
    };
    const p = paths[name] || '';
    return `<svg class="secure-icon icon-${name}" viewBox="0 0 24 24" width="${size}" height="${size}" stroke="${color}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; pointer-events:none; transition: filter 0.2s ease;">${p}</svg>`;
  }
};

window.Components = (function() {

  // ── Button ──
  function button(text, className, onClick, id) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (className || '');
    btn.textContent = text;
    if (id) btn.id = id;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  // ── Input Group (label + input) ──
  function input(label, placeholder, type, id, opts = {}) {
    const group = document.createElement('div');
    group.className = 'input-group';

    if (label) {
      const lbl = document.createElement('label');
      lbl.className = 'input-label';
      lbl.textContent = label;
      if (id) lbl.setAttribute('for', id);
      group.appendChild(lbl);
    }

    if (type === 'password' && opts.toggleable) {
      const wrapper = document.createElement('div');
      wrapper.className = 'password-wrapper';

      const inp = document.createElement('input');
      inp.className = 'input-field';
      inp.type = 'password';
      inp.placeholder = placeholder || '';
      if (id) inp.id = id;
      if (opts.maxlength) inp.maxLength = opts.maxlength;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'password-toggle';
      toggle.innerHTML = SecureIcons.getSvg('eye', 'var(--text-dim)', '16px');
      toggle.addEventListener('click', () => {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        toggle.innerHTML = inp.type === 'password' 
          ? SecureIcons.getSvg('eye', 'var(--text-dim)', '16px') 
          : SecureIcons.getSvg('eye-off', 'var(--text-dim)', '16px');
      });

      wrapper.appendChild(inp);
      wrapper.appendChild(toggle);
      group.appendChild(wrapper);
    } else {
      const inp = document.createElement('input');
      inp.className = 'input-field';
      inp.type = type || 'text';
      inp.placeholder = placeholder || '';
      if (id) inp.id = id;
      if (opts.maxlength) inp.maxLength = opts.maxlength;
      if (opts.autocomplete) inp.autocomplete = opts.autocomplete;
      group.appendChild(inp);
    }

    if (opts.hint) {
      const hint = document.createElement('div');
      hint.className = 'input-hint';
      hint.id = id ? id + '-hint' : '';
      hint.textContent = opts.hint;
      group.appendChild(hint);
    }

    return group;
  }

  // ── Message Bubble ──
  function messageBubble(msg) {
    // System message
    if (msg.type === 'system') {
      const div = document.createElement('div');
      div.className = 'system-msg';
      div.textContent = msg.text || msg.message;
      return div;
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble ' + (msg.isMine ? 'msg-sent' : 'msg-received');

    if (!msg.isMine && msg.senderName) {
      const sender = document.createElement('div');
      sender.className = 'msg-sender';
      sender.textContent = '@' + msg.senderName;
      bubble.appendChild(sender);
    }

    const text = document.createElement('div');
    text.className = 'msg-text';
    text.textContent = msg.text;
    bubble.appendChild(text);

    const meta = document.createElement('div');
    meta.className = msg.status === 'queued' ? 'msg-queued-badge' : 'msg-meta';

    if (msg.status === 'queued') {
      meta.innerHTML = SecureIcons.getSvg('clock', 'var(--text-dim)', '12px') + ' Queued';
    } else {
      const time = new Date(msg.timestamp);
      const timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');
      meta.textContent = timeStr + (msg.isMine ? ' ✓✓' : '');
    }
    bubble.appendChild(meta);

    return bubble;
  }

  // ── Member Item ──
  function memberItem(member, roomOwnerId, roomCoOwnerId, callbacks) {
    const item = document.createElement('div');
    item.className = 'member-item';

    const av = avatar(member.username);
    item.appendChild(av);

    const name = document.createElement('div');
    name.className = 'member-name';
    name.textContent = '@' + member.username;
    item.appendChild(name);

    // Online/offline indicator
    const statusDot = document.createElement('div');
    statusDot.className = member.online !== false ? 'badge-online' : 'badge-offline';
    item.appendChild(statusDot);

    // Role badges
    if (member.userId === roomOwnerId) {
      const badge = document.createElement('span');
      badge.className = 'member-badge badge-owner';
      badge.textContent = 'OWNER';
      item.appendChild(badge);
    } else if (member.userId === roomCoOwnerId) {
      const badge = document.createElement('span');
      badge.className = 'member-badge badge-coowner';
      badge.textContent = 'CO-OWNER';
      item.appendChild(badge);
    }

    // Promote button (only if current user is owner and target is not owner)
    if (callbacks && callbacks.onPromote && member.userId !== roomOwnerId) {
      const promoteBtn = document.createElement('button');
      promoteBtn.className = 'btn btn-sm btn-secondary';
      promoteBtn.textContent = 'Promote';
      promoteBtn.style.width = 'auto';
      promoteBtn.addEventListener('click', () => callbacks.onPromote(member.userId));
      item.appendChild(promoteBtn);
    }

    return item;
  }

  // ── Avatar ──
  function avatar(username) {
    const av = document.createElement('div');
    av.className = 'member-avatar';
    av.textContent = (username || '?')[0].toUpperCase();
    return av;
  }

  // ── Room Card ──
  function roomCard(room, onClick) {
    const card = document.createElement('div');
    card.className = 'room-card';
    if (onClick) card.addEventListener('click', () => onClick(room));

    const name = document.createElement('div');
    name.className = 'room-card-name';
    name.textContent = room.name;
    card.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'room-card-meta';
    meta.innerHTML = SecureIcons.getSvg('key', 'var(--accent)', '12px') + ' ' + (room.code || room.roomCode || '—');
    card.appendChild(meta);

    return card;
  }

  // ── Modal ──
  function modal(title, contentEl, actions) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';

    if (title) {
      const t = document.createElement('div');
      t.className = 'modal-title';
      t.textContent = title;
      card.appendChild(t);
    }

    if (contentEl) {
      if (typeof contentEl === 'string') {
        const p = document.createElement('div');
        p.innerHTML = contentEl;
        p.style.fontSize = '13px';
        p.style.color = 'var(--text-dim)';
        p.style.lineHeight = '1.6';
        card.appendChild(p);
      } else {
        card.appendChild(contentEl);
      }
    }

    if (actions && actions.length) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'modal-actions';
      actions.forEach(a => {
        const btn = button(a.text, a.className || 'btn-secondary', () => {
          if (a.onClick) a.onClick();
          if (a.autoClose !== false) close();
        });
        actionsDiv.appendChild(btn);
      });
      card.appendChild(actionsDiv);
    }

    overlay.appendChild(card);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    function close() {
      overlay.remove();
    }

    document.body.appendChild(overlay);
    return { element: overlay, close };
  }

  // ── Toast Notification ──
  function toast(message, type) {
    type = type || 'info';
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = message;
    document.body.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(-20px)';
      t.style.transition = 'all 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, 3000);

    return t;
  }

  // ── Loading Spinner ──
  function loadingSpinner(text) {
    const container = document.createElement('div');
    container.className = 'loading-container';

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    container.appendChild(spinner);

    if (text) {
      const label = document.createElement('div');
      label.className = 'loading-text';
      label.textContent = text;
      container.appendChild(label);
    }

    return container;
  }

  // ── Encryption Badge ──
  function encryptionBadge() {
    const badge = document.createElement('div');
    badge.className = 'encryption-badge';
    badge.innerHTML = SecureIcons.getSvg('lock', 'var(--accent)', '12px') + ' E2E Encrypted';
    return badge;
  }

  // ── Empty State ──
  function emptyState(iconName, text) {
    const container = document.createElement('div');
    container.className = 'empty-state';

    const ic = document.createElement('div');
    ic.className = 'empty-state-icon';
    if (iconName && iconName.includes('<svg')) {
      ic.innerHTML = iconName;
    } else if (iconName === '💬' || iconName === 'chat') {
      ic.innerHTML = SecureIcons.getSvg('chat', 'var(--text-dim)', '48px');
    } else if (iconName === '📋' || iconName === 'log') {
      ic.innerHTML = SecureIcons.getSvg('clipboard', 'var(--text-dim)', '48px');
    } else if (iconName) {
      ic.innerHTML = SecureIcons.getSvg(iconName, 'var(--text-dim)', '48px');
    } else {
      ic.innerHTML = SecureIcons.getSvg('chat', 'var(--text-dim)', '48px');
    }
    container.appendChild(ic);

    const txt = document.createElement('div');
    txt.className = 'empty-state-text';
    txt.textContent = text || 'Nothing here yet.';
    container.appendChild(txt);

    return container;
  }

  // ── Join Request Popup ──
  function joinRequestPopup(username, userId, onApprove, onDeny) {
    const popup = document.createElement('div');
    popup.className = 'join-request-popup';
    popup.id = 'join-request-' + userId;

    const icon = document.createElement('div');
    icon.className = 'join-request-icon';
    icon.innerHTML = SecureIcons.getSvg('door', 'var(--accent)', '24px');
    popup.appendChild(icon);

    const title = document.createElement('div');
    title.className = 'join-request-title';
    title.textContent = 'Join Request';
    popup.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'join-request-sub';
    sub.innerHTML = '<strong style="color:var(--accent)">@' + username + '</strong> wants to join this room.';
    popup.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'join-request-actions';

    const denyBtn = button('Deny', 'btn-danger', () => {
      onDeny(userId);
      popup.remove();
    });
    actions.appendChild(denyBtn);

    const approveBtn = button('Approve', 'btn-primary', () => {
      onApprove(userId);
      popup.remove();
    });
    actions.appendChild(approveBtn);

    popup.appendChild(actions);
    document.body.appendChild(popup);

    return popup;
  }

  // ── System Message ──
  function systemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    return div;
  }

  // ── Header ──
  function header(title, actions) {
    const h = document.createElement('div');
    h.className = 'header';

    const t = document.createElement('div');
    t.className = 'header-title';
    t.textContent = title;
    h.appendChild(t);

    if (actions && actions.length) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'header-actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'icon-btn' + (a.danger ? ' icon-btn-danger' : '');
        if (a.icon && a.icon.includes('<svg')) {
          btn.innerHTML = a.icon;
        } else {
          btn.textContent = a.icon || '';
        }
        btn.title = a.title || '';
        if (a.onClick) btn.addEventListener('click', a.onClick);
        actionsDiv.appendChild(btn);
      });
      h.appendChild(actionsDiv);
    }

    return h;
  }

  // ── Back Button ──
  function backButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'back-btn';
    btn.innerHTML = SecureIcons.getSvg('arrow-left', 'var(--accent)', '14px') + ' Back';
    btn.addEventListener('click', onClick || (() => Router.navigate('home')));
    return btn;
  }

  return {
    button, input, messageBubble, memberItem, avatar, roomCard,
    modal, toast, loadingSpinner, encryptionBadge, emptyState,
    joinRequestPopup, systemMessage, header, backButton,
  };
})();
