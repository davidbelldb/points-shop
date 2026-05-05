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
  getSettings: () => request('/settings'),
  listProducts: () => request('/products'),
  getProduct: (id) => request(`/products/${id}`),
  getAccount: () => request('/account'),
  updateAccount: (patch) => request('/account', { method: 'PATCH', body: JSON.stringify(patch) }),
  getLedgerAdjustments: (limit) => request(`/account/ledger/adjustments${limit ? `?limit=${limit}` : ''}`),
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
  listHeroSlides: () => request('/hero-slides'),
  listReviews: (productId) => request(`/products/${productId}/reviews`),
  createReview: (productId, body) => request(`/products/${productId}/reviews`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateReview: (reviewId, body) => request(`/reviews/${reviewId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  deleteReview: (reviewId) => request(`/reviews/${reviewId}`, { method: 'DELETE' }),
  thumbsUp: (reviewId) => request(`/reviews/${reviewId}/thumbs-up`, { method: 'POST' }),
  removeThumbsUp: (reviewId) => request(`/reviews/${reviewId}/thumbs-up`, { method: 'DELETE' }),
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
    creditPoints:    (delta, reason) =>
      request('/admin/account/credit', { method: 'POST', body: JSON.stringify({ delta, reason }) }),
    updateSettings:  (patch) => request('/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
    listDiscountCodes:  () => request('/admin/discount-codes'),
    createDiscountCode: (data) => request('/admin/discount-codes', { method: 'POST', body: JSON.stringify(data) }),
    updateDiscountCode: (id, patch) => request(`/admin/discount-codes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteDiscountCode: (id) => request(`/admin/discount-codes/${id}`, { method: 'DELETE' }),
    listAllHeroSlides: () => request('/admin/hero-slides'),
    createHeroSlide: (data) => request('/admin/hero-slides', { method: 'POST', body: JSON.stringify(data) }),
    updateHeroSlide: (id, patch) => request(`/admin/hero-slides/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteHeroSlide: (id) => request(`/admin/hero-slides/${id}`, { method: 'DELETE' }),
    listAllSurveys: () => request('/admin/surveys'),
    getSurvey: (id) => request(`/admin/surveys/${id}`),
    createSurvey: (data) => request('/admin/surveys', { method: 'POST', body: JSON.stringify(data) }),
    updateSurvey: (id, patch) => request(`/admin/surveys/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteSurvey: (id) => request(`/admin/surveys/${id}`, { method: 'DELETE' }),
    createQuestion: (surveyId, data) => request(`/admin/surveys/${surveyId}/questions`, { method: 'POST', body: JSON.stringify(data) }),
    updateQuestion: (id, patch) => request(`/admin/questions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteQuestion: (id) => request(`/admin/questions/${id}`, { method: 'DELETE' }),
    listSurveyResponses: (surveyId) => request(`/admin/surveys/${surveyId}/responses`),
    listAllOrders: () => request('/admin/orders'),
    updateOrderStatus: (id, status, reason) =>
      request(`/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
    upload: uploadFile,
  },
};
