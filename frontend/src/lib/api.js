const BASE = '/api';

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message || `API ${res.status}`);
  }
  return res.json();
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/admin/upload`, { credentials: 'include', method: 'POST', body: fd });
  if (!res.ok) {
    let message = res.statusText;
    try { const b = await res.json(); if (b?.error) message = b.error; } catch {}
    throw new Error(message || `Upload ${res.status}`);
  }
  return res.json();
}

// Non-admin upload — same response shape, but on /api/upload so it bypasses
// the Caddy basicauth on /api/admin/*. Use for any user-generated content
// (stories, voice notes, profile photos).
async function uploadFilePublic(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/upload`, { credentials: 'include', method: 'POST', body: fd });
  if (!res.ok) {
    let message = res.statusText;
    try { const b = await res.json(); if (b?.error) message = b.error; } catch {}
    throw new Error(message || `Upload ${res.status}`);
  }
  return res.json();
}

export const api = {
  upload: uploadFilePublic,
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  getMessages: () => request('/messages'),
  sendMessage: (body, replyToStoryId = null, replyToMessageId = null, sliderResponse = null) =>
    request('/messages', {
      method: 'POST',
      body: JSON.stringify({
        body,
        reply_to_story_id: replyToStoryId,
        reply_to_message_id: replyToMessageId,
        slider_response: sliderResponse,
      }),
    }),
  markMessagesRead: () => request('/messages/mark-read', { method: 'POST' }),
  deleteMessage: (id) => request(`/messages/${id}`, { method: 'DELETE' }),
  editMessage: (id, body) =>
    request(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  setMessageReaction: (id, reaction) =>
    request(`/messages/${id}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }),
  listCalendarEvents: (fromIso, toIso) =>
    request(`/calendar/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`),
  listCalendarUpcoming: (limit = 3) =>
    request(`/calendar/upcoming?limit=${limit}`),
  getCalendarEvent: (id) => request(`/calendar/events/${id}`),
  createCalendarEvent: (data) =>
    request('/calendar/events', { method: 'POST', body: JSON.stringify(data) }),
  updateCalendarEvent: (id, patch) =>
    request(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCalendarEvent: (id) =>
    request(`/calendar/events/${id}`, { method: 'DELETE' }),
  listActiveStories: () => request('/stories/active'),
  listArchiveStories: (fromIso, toIso) => {
    const qs = (fromIso && toIso)
      ? `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
      : '';
    return request(`/stories/archive${qs}`);
  },
  getStory: (id) => request(`/stories/${id}`),
  createStory: (data) => request('/stories', { method: 'POST', body: JSON.stringify(data) }),
  deleteStory: (id) => request(`/stories/${id}`, { method: 'DELETE' }),
  markStoryViewed: (id) => request(`/stories/${id}/view`, { method: 'POST' }),
  // Default scope is 'mine' — only the caller's own reels.
  // Pass { scope: 'all' } for the shared home-strip view.
  listReels: ({ scope } = {}) => request(`/reels${scope === 'all' ? '?scope=all' : ''}`),
  getReel: (id) => request(`/reels/${id}`),
  createReel: (data) => request('/reels', { method: 'POST', body: JSON.stringify(data) }),
  updateReel: (id, patch) =>
    request(`/reels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteReel: (id) => request(`/reels/${id}`, { method: 'DELETE' }),
  addStoryToReel: (reelId, storyId) =>
    request(`/reels/${reelId}/stories`, { method: 'POST', body: JSON.stringify({ story_id: storyId }) }),
  removeStoryFromReel: (reelId, storyId) =>
    request(`/reels/${reelId}/stories/${storyId}`, { method: 'DELETE' }),
  getSettings: () => request('/settings'),
  listProducts: () => request('/products'),
  getProduct: (id) => request(`/products/${id}`),
  getAccount: () => request('/account'),
  updateAccount: (patch) => request('/account', { method: 'PATCH', body: JSON.stringify(patch) }),
  getLedgerAdjustments: (limit) => request(`/account/ledger/adjustments${limit ? `?limit=${limit}` : ''}`),
  deleteLedgerEntry: (id) => request(`/account/ledger/${id}`, { method: 'DELETE' }),
  getBasket: () => request('/basket'),
  addToBasket: (productId, qty = 1) =>
    request('/basket/items', { method: 'POST', body: JSON.stringify({ productId, qty }) }),
  setBasketItemQty: (productId, qty) =>
    request(`/basket/items/${productId}`, { method: 'PATCH', body: JSON.stringify({ qty }) }),
  removeBasketItem: (productId) =>
    request(`/basket/items/${productId}`, { method: 'DELETE' }),
  applyPromo: (code) =>
    request('/basket/promo', { method: 'POST', body: JSON.stringify({ code }) }),
  removePromo: () => request('/basket/promo', { method: 'DELETE' }),
  listHeroSlides: (placement = 'top') => request(`/hero-slides?placement=${placement}`),
  listAudioNotes: () => request('/audio-notes'),
  getRandomTodPrompt: (type) => request(`/games/truth-or-dare/random?type=${type}`),
  getGamePlayers: () => request('/games/players'),
  ttfState:    () => request('/games/tic-tac-face/state'),
  ttfStart:    () => request('/games/tic-tac-face/start', { method: 'POST' }),
  ttfMove:     (gameId, boardIndex, cellIndex) => request('/games/tic-tac-face/move', { method: 'POST', body: JSON.stringify({ gameId, boardIndex, cellIndex }) }),
  ttfResign:   () => request('/games/tic-tac-face/resign', { method: 'POST' }),
  ttfMarkRead:      () => request('/games/tic-tac-face/mark-read', { method: 'POST' }),
  ttfLeaderboard:   () => request('/games/tic-tac-face/leaderboard'),
  gsState:    () => request('/games/giftsweeper/state'),
  gsStart:    (config) => request('/games/giftsweeper/start', { method: 'POST', body: JSON.stringify(config || {}) }),
  gsSetItems: (items) => request('/games/giftsweeper/items', { method: 'POST', body: JSON.stringify({ items }) }),
  gsAddItem:    (item) => request('/games/giftsweeper/item', { method: 'POST', body: JSON.stringify(item) }),
  gsRemoveItem: (id) => request(`/games/giftsweeper/item/${id}`, { method: 'DELETE' }),
  gsGuess:  (cells) => request('/games/giftsweeper/guess', { method: 'POST', body: JSON.stringify({ cells }) }),
  gsGrovel: () => request('/games/giftsweeper/grovel', { method: 'POST' }),
  listRewards:  () => request('/account/rewards'),
  claimReward:  (id) => request(`/account/rewards/${id}/claim`, { method: 'POST' }),
  deleteReward: (id) => request(`/account/rewards/${id}`, { method: 'DELETE' }),
  getActiveWheel:    () => request('/wheels/active'),
  getHomepageWheel: () => request('/wheels/homepage'),
  spinWheel:      (id) => request(`/wheels/${id}/spin`, { method: 'POST' }),
  gsConfirm:  () => request('/games/giftsweeper/confirm', { method: 'POST' }),
  gsAbandon:  () => request('/games/giftsweeper/abandon', { method: 'POST' }),
  gsMarkRead:      () => request('/games/giftsweeper/mark-read', { method: 'POST' }),
  gsLeaderboard:   () => request('/games/giftsweeper/leaderboard'),
  stbState:   () => request('/games/shut-the-box/state'),
  stbStart:   () => request('/games/shut-the-box/start', { method: 'POST' }),
  stbEnd:     (payload) => request('/games/shut-the-box/end', { method: 'POST', body: JSON.stringify(payload) }),
  getStbConfig: () => request('/games/shut-the-box/config'),
  stb15Start:   () => request('/games/shut-the-box-15/start', { method: 'POST' }),
  stb15End:     (payload) => request('/games/shut-the-box-15/end', { method: 'POST', body: JSON.stringify(payload) }),
  getStb15Config: () => request('/games/shut-the-box-15/config'),
  getStb15Props:  () => request('/games/shut-the-box-15/props'),
  duckyConfig: () => request('/games/ducky/config'),
  duckyLineup: () => request('/games/ducky/lineup', { method: 'POST' }),
  duckyRace: (lineup_id, picked_ord, stake) =>
    request('/games/ducky/race', { method: 'POST', body: JSON.stringify({ lineup_id, picked_ord, stake }) }),
  duckyForm: () => request('/games/ducky/form'),
  cambsRageWin: (difficulty, matchId) =>
    request('/games/cambs-rage/win', { method: 'POST', body: JSON.stringify({ difficulty, matchId }) }),
  dirtyWordleResult: (payload) =>
    request('/games/dirty-wordle/result', { method: 'POST', body: JSON.stringify(payload) }),
  dirtyWordleLeaderboard: (date) =>
    request(`/games/dirty-wordle/leaderboard?date=${date}`),
  dirtyWordleProgress: (date) =>
    request(`/games/dirty-wordle/progress?date=${date}`),
  dirtyWordleSaveProgress: (payload) =>
    request('/games/dirty-wordle/progress', { method: 'POST', body: JSON.stringify(payload) }),
  rewatchList: () => request('/rewatch'),
  rewatchPartner: () => request('/rewatch/partner'),
  rewatchSearch: (q) => request(`/rewatch/search?q=${encodeURIComponent(q)}`),
  rewatchGet: (id) => request(`/rewatch/${id}`),
  rewatchSeason: (id, n) => request(`/rewatch/${id}/season/${n}`),
  rewatchInvites: () => request('/rewatch/invites'),
  acceptRewatchInvite: (id, seenBefore) =>
    request(`/rewatch/invites/${id}/accept`, { method: 'POST', body: JSON.stringify({ seen_before: seenBefore }) }),
  declineRewatchInvite: (id) => request(`/rewatch/invites/${id}/decline`, { method: 'POST' }),
  addRewatch: (data) => request('/rewatch', { method: 'POST', body: JSON.stringify(data) }),
  updateRewatch: (id, patch) => request(`/rewatch/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRewatch: (id) => request(`/rewatch/${id}`, { method: 'DELETE' }),
  listReviews: (productId) => request(`/products/${productId}/reviews`),
  createReview: (productId, body) => request(`/products/${productId}/reviews`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateReview: (reviewId, body) => request(`/reviews/${reviewId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteReview: (reviewId) => request(`/reviews/${reviewId}`, { method: 'DELETE' }),
  likeReview: (reviewId) => request(`/reviews/${reviewId}/likes`, { method: 'POST' }),
  unlikeReview: (reviewId) => request(`/reviews/${reviewId}/likes`, { method: 'DELETE' }),
  getDeliveryOptions: () => request('/delivery-options'),
  setBasketDelivery: (delivery_option_id) =>
    request('/basket/delivery', { method: 'PATCH', body: JSON.stringify({ delivery_option_id }) }),
  setBasketNotes: (notes) =>
    request('/basket/notes', { method: 'PATCH', body: JSON.stringify({ notes }) }),
  placeOrder: () => request('/orders', { method: 'POST' }),
  getOrder: (id) => request(`/orders/${id}`),
  getNotifications: () => request('/notifications'),
  markNotificationsRead: () => request('/notifications/mark-read', { method: 'POST' }),
  dismissNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  getVapidKey: () => request('/notifications/vapid-key'),
  savePushSubscription: (sub) => request('/notifications/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  removePushSubscription: (endpoint) =>
    request('/notifications/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  getActiveSurvey: () => request('/surveys/active'),
  submitSurveyResponse: (surveyId, answers) =>
    request(`/surveys/${surveyId}/responses`, { method: 'POST', body: JSON.stringify({ answers }) }),
  clearAllNotifications: () => request('/notifications', { method: 'DELETE' }),
  listOrders: (bucket, limit) => {
    const params = new URLSearchParams();
    if (bucket) params.set('bucket', bucket);
    if (limit)  params.set('limit', String(limit));
    const qs = params.toString();
    return request(`/orders${qs ? `?${qs}` : ''}`);
  },
  // Notes
  listNotes: (status = 'active') => request(`/notes?status=${status}`),
  createNote: (type = 'personal') => request('/notes', { method: 'POST', body: JSON.stringify({ type }) }),
  updateNote: (id, body) => request(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  changeNoteType: (id, type) => request(`/notes/${id}/type`, { method: 'PATCH', body: JSON.stringify({ type }) }),
  archiveNote: (id) => request(`/notes/${id}/archive`, { method: 'PATCH' }),
  restoreNote: (id) => request(`/notes/${id}/restore`, { method: 'PATCH' }),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  hardDeleteNote: (id) => request(`/notes/${id}/permanent`, { method: 'DELETE' }),

  // Moments — returns { moments, partner }
  listMoments: () => request('/moments'),
  createMoment: (type = 'personal') => request('/moments', { method: 'POST', body: JSON.stringify({ type }) }),
  getMoment: (id) => request(`/moments/${id}`),
  updateMoment: (id, patch) => request(`/moments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  promoteMoment: (id) => request(`/moments/${id}/promote`, { method: 'PATCH' }),
  deleteMoment: (id) => request(`/moments/${id}`, { method: 'DELETE' }),
  addMomentMedia: (id, url, type) => request(`/moments/${id}/media`, { method: 'POST', body: JSON.stringify({ url, type }) }),
  removeMomentMedia: (momentId, mediaId) => request(`/moments/${momentId}/media/${mediaId}`, { method: 'DELETE' }),

  // WebRTC signaling
  rtcSignal: (type, payload) => request('/rtc/signal', { method: 'POST', body: JSON.stringify({ type, payload }) }),
  rtcPoll:   () => request('/rtc/signal'),

  // Sneaky Calls
  callsPlayers: () => request('/calls/players'),
  callsRing:    () => request('/calls/ring', { method: 'POST', body: JSON.stringify({}) }),
  callsStatus:  () => request('/calls/status'),
  callsAnswer:  () => request('/calls/answer', { method: 'POST', body: JSON.stringify({}) }),
  callsCancel:  () => request('/calls/cancel', { method: 'POST', body: JSON.stringify({}) }),
  callsSuperRain: () => request('/calls/super-rain', { method: 'POST', body: JSON.stringify({}) }),

  // Cambs Rage online challenge
  crChallenge:       () => request('/games/cambs-rage/challenge', { method: 'POST', body: JSON.stringify({}) }),
  crChallengeStatus: () => request('/games/cambs-rage/challenge'),
  crChallengeAnswer: () => request('/games/cambs-rage/challenge/answer', { method: 'POST', body: JSON.stringify({}) }),
  crChallengeCancel: () => request('/games/cambs-rage/challenge/cancel', { method: 'POST', body: JSON.stringify({}) }),
  crOnlineWin:       (matchId) => request('/games/cambs-rage/online-win', { method: 'POST', body: JSON.stringify({ matchId }) }),

  // Shopping list
  shopItems:       () => request('/shopping/items'),
  shopAddItem:     (item) => request('/shopping/items', { method: 'POST', body: JSON.stringify(item) }),
  shopUpdateItem:  (id, patch) => request(`/shopping/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  shopDeleteItem:  (id) => request(`/shopping/items/${id}`, { method: 'DELETE' }),
  shopClearChecked:(tripId = null) => request('/shopping/clear-checked', { method: 'POST', body: JSON.stringify({ trip_id: tripId }) }),
  shopTrips:       () => request('/shopping/trips'),
  shopAddTrip:     (name) => request('/shopping/trips', { method: 'POST', body: JSON.stringify({ name }) }),
  shopRenameTrip:  (id, name) => request(`/shopping/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  shopDeleteTrip:  (id) => request(`/shopping/trips/${id}`, { method: 'DELETE' }),
  shopSuggest:     (q) => request(`/shopping/suggest?q=${encodeURIComponent(q)}`),
  shopOffSearch:   (q) => request(`/shopping/off-search?q=${encodeURIComponent(q)}`),
  shopOffProduct:  (barcode) => request(`/shopping/off-product/${encodeURIComponent(barcode)}`),

  // Sneaky Spreadsheets
  sheetTabs:      () => request('/spreadsheets/tabs'),
  sheetCreateTab: (name) => request('/spreadsheets/tabs', { method: 'POST', body: JSON.stringify({ name }) }),
  sheetUpdateTab: (id, patch) => request(`/spreadsheets/tabs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  sheetDeleteTab: (id) => request(`/spreadsheets/tabs/${id}`, { method: 'DELETE' }),

  admin: {
    listProducts:    () => request('/admin/products'),
    createProduct:   (data) => request('/admin/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct:   (id, patch) => request(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    setInventory:    (id, stock_qty, lead_time_days) =>
      request(`/admin/products/${id}/inventory`, { method: 'PATCH', body: JSON.stringify({ stock_qty, lead_time_days }) }),
    addProductMedia: (id, payload) =>
      request(`/admin/products/${id}/media`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteMedia:     (mediaId) => request(`/admin/media/${mediaId}`, { method: 'DELETE' }),
    updateAccount:   (patch) => request('/admin/account', { method: 'PATCH', body: JSON.stringify(patch) }),
    creditPoints:    (delta, reason, target_account_id = null) =>
      request('/admin/account/credit', { method: 'POST', body: JSON.stringify({ delta, reason, target_account_id }) }),
    updateSettings:  (patch) => request('/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
    listDiscountCodes:  () => request('/admin/discount-codes'),
    createDiscountCode: (data) => request('/admin/discount-codes', { method: 'POST', body: JSON.stringify(data) }),
    updateDiscountCode: (id, patch) => request(`/admin/discount-codes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteDiscountCode: (id) => request(`/admin/discount-codes/${id}`, { method: 'DELETE' }),
    listAllHeroSlides: () => request('/admin/hero-slides'),
    createHeroSlide: (data) => request('/admin/hero-slides', { method: 'POST', body: JSON.stringify(data) }),
    updateHeroSlide: (id, patch) => request(`/admin/hero-slides/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteHeroSlide: (id) => request(`/admin/hero-slides/${id}`, { method: 'DELETE' }),
    listAllAudioNotes: () => request('/admin/audio-notes'),
    createAudioNote: (data) => request('/admin/audio-notes', { method: 'POST', body: JSON.stringify(data) }),
    updateAudioNote: (id, patch) => request(`/admin/audio-notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteAudioNote: (id) => request(`/admin/audio-notes/${id}`, { method: 'DELETE' }),
    listTodPrompts: () => request('/admin/tod-prompts'),
    createTodPrompt: (data) => request('/admin/tod-prompts', { method: 'POST', body: JSON.stringify(data) }),
    updateTodPrompt: (id, patch) => request(`/admin/tod-prompts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteTodPrompt: (id) => request(`/admin/tod-prompts/${id}`, { method: 'DELETE' }),
    listAllSurveys: () => request('/admin/surveys'),
    getSurvey: (id) => request(`/admin/surveys/${id}`),
    createSurvey: (data) => request('/admin/surveys', { method: 'POST', body: JSON.stringify(data) }),
    updateSurvey: (id, patch) => request(`/admin/surveys/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteSurvey: (id) => request(`/admin/surveys/${id}`, { method: 'DELETE' }),
    createQuestion: (surveyId, data) => request(`/admin/surveys/${surveyId}/questions`, { method: 'POST', body: JSON.stringify(data) }),
    updateQuestion: (id, patch) => request(`/admin/questions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteQuestion: (id) => request(`/admin/questions/${id}`, { method: 'DELETE' }),
    listSurveyResponses: (surveyId) => request(`/admin/surveys/${surveyId}/responses`),
    listUsers: () => request('/admin/users'),
    startImpersonate: (target_user_id) => request('/admin/impersonate', { method: 'POST', body: JSON.stringify({ target_user_id }) }),
    stopImpersonate: () => request('/admin/impersonate', { method: 'DELETE' }),
    muteUser: (id, minutes) => request(`/admin/users/${id}/mute`, { method: 'POST', body: JSON.stringify({ minutes }) }),
    unmuteUser: (id) => request(`/admin/users/${id}/mute`, { method: 'DELETE' }),
    listAllOrders: () => request('/admin/orders'),
    updateOrderStatus: (id, status, reason) =>
      request(`/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
    getWheel:              () => request('/admin/wheel'),
    updateWheel:           (patch) => request('/admin/wheel', { method: 'PATCH', body: JSON.stringify(patch) }),
    addWheelSegment:       (data) => request('/admin/wheel/segments', { method: 'POST', body: JSON.stringify(data) }),
    updateWheelSegment:    (id, patch) => request(`/admin/wheel/segments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteWheelSegment:    (id) => request(`/admin/wheel/segments/${id}`, { method: 'DELETE' }),
    getStbConfig:          () => request('/admin/shut-the-box'),
    updateStbConfig:       (patch) => request('/admin/shut-the-box', { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStbScatteredSet: (ord, patch) => request(`/admin/shut-the-box/scattered-sets/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStbTableColour: (ord, patch) => request(`/admin/shut-the-box/table-colours/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStbDicePalette: (ord, patch) => request(`/admin/shut-the-box/dice-palettes/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStbTileMessage: (ord, patch) => request(`/admin/shut-the-box/tile-messages/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    getStb15Config:          () => request('/admin/shut-the-box-15'),
    updateStb15Config:       (patch) => request('/admin/shut-the-box-15', { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStb15ScatteredSet: (ord, patch) => request(`/admin/shut-the-box-15/scattered-sets/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStb15TableColour:  (ord, patch) => request(`/admin/shut-the-box-15/table-colours/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStb15DicePalette:  (ord, patch) => request(`/admin/shut-the-box-15/dice-palettes/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateStb15TileMessage:  (ord, patch) => request(`/admin/shut-the-box-15/tile-messages/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    getStb15Props:           () => request('/admin/shut-the-box-15/props'),
    updateStb15Prop:         (key, patch) => request(`/admin/shut-the-box-15/props/${key}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    getDucky: () => request('/admin/games/ducky'),
    updateDucky: (patch) => request('/admin/games/ducky', { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyDuck: (ord, patch) => request(`/admin/games/ducky/ducks/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyBanner: (ord, patch) => request(`/admin/games/ducky/banners/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyPhrase: (ord, patch) => request(`/admin/games/ducky/phrases/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyCommentary: (ord, patch) => request(`/admin/games/ducky/commentary/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyIntro: (ord, patch) => request(`/admin/games/ducky/intro/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyNightPhrase: (ord, patch) => request(`/admin/games/ducky/night-phrases/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyNightCommentary: (ord, patch) => request(`/admin/games/ducky/night-commentary/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    updateDuckyNightIntro: (ord, patch) => request(`/admin/games/ducky/night-intro/${ord}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    upload: uploadFile,
    users:           ()        => request('/admin/users'),
    pushBroadcast:   (payload) => request('/admin/push-broadcast',    { method: 'POST',   body: JSON.stringify(payload) }),
    pushScheduled:   ()        => request('/admin/push-scheduled'),
    pushCancelScheduled: (id)  => request(`/admin/push-scheduled/${id}`, { method: 'DELETE' }),
    pushDismiss:     ()        => request('/admin/push-dismiss',       { method: 'POST' }),
    changeOtherUserPassword: (password) =>
      request('/admin/other-account/password', { method: 'PATCH', body: JSON.stringify({ password }) }),
  },
};
