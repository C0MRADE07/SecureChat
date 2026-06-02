// ═══════════════════════════════════════════
// SecureChat — UI Components
// Reusable DOM element creators
// ═══════════════════════════════════════════

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
      toggle.textContent = '👁';
      toggle.addEventListener('click', () => {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        toggle.textContent = inp.type === 'password' ? '👁' : '🙈';
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
      meta.textContent = '⏳ Queued';
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
    meta.textContent = '🔑 ' + (room.code || room.roomCode || '—');
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
    badge.textContent = '🔐 E2E Encrypted';
    return badge;
  }

  // ── Empty State ──
  function emptyState(icon, text) {
    const container = document.createElement('div');
    container.className = 'empty-state';

    const ic = document.createElement('div');
    ic.className = 'empty-state-icon';
    ic.textContent = icon || '💬';
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
    icon.textContent = '🚪';
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
        btn.textContent = a.icon;
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
    btn.innerHTML = '← Back';
    btn.addEventListener('click', onClick || (() => Router.navigate('home')));
    return btn;
  }

  return {
    button, input, messageBubble, memberItem, avatar, roomCard,
    modal, toast, loadingSpinner, encryptionBadge, emptyState,
    joinRequestPopup, systemMessage, header, backButton,
  };
})();
