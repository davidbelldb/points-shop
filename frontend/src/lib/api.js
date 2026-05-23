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

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  getMessages: () => request('/messages'),
  sendMessage: (body) => request('/messages', { method: 'POST', body: JSON.stringify({ body }) }),
  markMessagesRead: () => request('/messages/mark-read', { method: 'POST' }),
  deleteMessage: (id) => request(`/messages/${id}`, { method: 'DELETE' }),
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
  getRandomTodPrompt: (type) => request(`/games/truth-or-dare/random?type=${type}`),
  getGamePlayers: () => request('/games/players'),
  ttfState:    () => request('/games/tic-tac-face/state'),
  ttfStart:    () => request('/games/tic-tac-face/start', { method: 'POST' }),
  ttfMove:     (gameId, index) => request('/games/tic-tac-face/move', { method: 'POST', body: JSON.stringify({ gameId, index }) }),
  ttfResign:   () => request('/games/tic-tac-face/resign', { method: 'POST' }),
  ttfMarkRead: () => request('/games/tic-tac-face/mark-read', { method: 'POST' }),
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
  gsMarkRead: () => request('/games/giftsweeper/mark-read', { method: 'POST' }),
  stbState:   () => request('/games/shut-the-box/state'),
  stbStart:   () => request('/games/shut-the-box/start', { method: 'POST' }),
  stbEnd:     (payload) => request('/games/shut-the-box/end', { method: 'POST', body: JSON.stringify(payload) }),
  getStbConfig: () => request('/games/shut-the-box/config'),
  rewatchList: () => request('/rewatch'),
  rewatchPartner: () => request('/rewatch/partner'),
  rewatchSearch: (q) => request(`/rewatch/search?q=${encodeURIComponent(q)}`),
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
    upload: uploadFile,
  },
};
