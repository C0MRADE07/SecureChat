// ═══════════════════════════════════════════
// SecureChat — WebCrypto Encryption Layer
// RSA-2048 + AES-256-GCM Hybrid Encryption
// ═══════════════════════════════════════════

window.SecureCrypto = (function() {

  // ── Helpers ──
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function generateUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // ── RSA-2048 Key Pair Generation ──
  async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable (so we can export public key)
      ['encrypt', 'decrypt']
    );

    // Export public key as base64 SPKI
    const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

    // Store in IndexedDB
    await SecureStorage.saveKeyPair(publicKeyB64, keyPair.privateKey);

    return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicKeyB64 };
  }

  // ── Export Public Key to Base64 SPKI ──
  async function exportPublicKey(cryptoKey) {
    const exported = await crypto.subtle.exportKey('spki', cryptoKey);
    return arrayBufferToBase64(exported);
  }

  // ── Import Public Key from Base64 SPKI ──
  async function importPublicKey(base64) {
    const keyData = base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
      'spki', keyData,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );
  }

  // ── Hybrid Encrypt Message ──
  // memberPublicKeys: { userId: base64PublicKey, ... }
  async function encryptMessage(plaintext, memberPublicKeys) {
    // 1. Generate random AES-256-GCM key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    // 2. Generate random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 3. Encrypt plaintext with AES
    const encoded = encoder.encode(plaintext);
    const encryptedMessage = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoded
    );

    // 4. Export raw AES key
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

    // 5. Encrypt AES key for each recipient with their RSA public key
    const encryptedKeys = {};
    for (const [userId, pubKeyB64] of Object.entries(memberPublicKeys)) {
      try {
        const pubKey = await importPublicKey(pubKeyB64);
        const encryptedAesKey = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          pubKey,
          rawAesKey
        );
        encryptedKeys[userId] = arrayBufferToBase64(encryptedAesKey);
      } catch (err) {
        console.error(`Failed to encrypt for user ${userId}:`, err);
      }
    }

    return {
      iv: arrayBufferToBase64(iv),
      encryptedMessage: arrayBufferToBase64(encryptedMessage),
      encryptedKeys,
      senderId: AppState.get('user').id,
      timestamp: Date.now(),
      messageId: generateUUID(),
    };
  }

  // ── Hybrid Decrypt Message ──
  async function decryptMessage(payload, privateKey, myUserId) {
    try {
      // 1. Get my encrypted AES key
      const myEncryptedKey = payload.encryptedKeys[myUserId];
      if (!myEncryptedKey) {
        console.warn('No encrypted key found for this user');
        return null;
      }

      // 2. Decrypt AES key with RSA private key
      const rawAesKey = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        base64ToArrayBuffer(myEncryptedKey)
      );

      // 3. Import AES key
      const aesKey = await crypto.subtle.importKey(
        'raw', rawAesKey,
        'AES-GCM',
        false,
        ['decrypt']
      );

      // 4. Decrypt message
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(payload.iv) },
        aesKey,
        base64ToArrayBuffer(payload.encryptedMessage)
      );

      return decoder.decode(decrypted);
    } catch (err) {
      console.error('Decryption failed:', err);
      return '[Decryption failed]';
    }
  }

  // ── PBKDF2 Room Password Derivation ──
  async function deriveRoomKey(password, roomId) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(roomId || 'securechat-salt'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    return arrayBufferToBase64(derivedBits);
  }

  return {
    generateKeyPair, exportPublicKey, importPublicKey,
    encryptMessage, decryptMessage, deriveRoomKey,
    arrayBufferToBase64, base64ToArrayBuffer, generateUUID,
  };
})();
