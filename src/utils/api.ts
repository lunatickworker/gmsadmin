import { projectId, publicAnonKey } from '../../utils/supabase/info';

// Edge Function endpoint - swift-api로 배포됨
const API_BASE = `https://${projectId}.supabase.co/functions/v1/swift-api/make-server-cd65d9bc`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${publicAnonKey}`,
};

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`서버 응답 오류 (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `요청 실패 (${res.status})`);
  }
  return data;
}

export const api = {
  // ==================== 인증 ====================
  async login(username: string, password: string) {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  },

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    return apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ userId, oldPassword, newPassword }) });
  },

  // ==================== 사용자 (DB) ====================
  async getUsers(params?: { viewer_id?: string; role?: string; status?: string; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.viewer_id) qs.set('viewer_id', params.viewer_id);
    if (params?.role) qs.set('role', params.role);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiFetch(`/users?${qs}`);
  },

  async getUser(id: string) {
    return apiFetch(`/users/${id}`);
  },

  async createUser(data: { username: string; password: string; name: string; role: string; parent_id?: string }) {
    return apiFetch('/users', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateUserStatus(id: string, status: string) {
    return apiFetch(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },

  async updateUserBalance(id: string, balance: number) {
    return apiFetch(`/users/${id}/balance`, { method: 'PATCH', body: JSON.stringify({ balance }) });
  },

  async getUserInvestBalance(id: string): Promise<{ balance: number }> {
    return apiFetch(`/users/${id}/invest-balance`);
  },

  // ==================== 입출금 (DB) ====================
  async getDbTransactions(params?: { type?: string; status?: string; user_id?: string; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.user_id) qs.set('user_id', params.user_id);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiFetch(`/db/transactions?${qs}`);
  },

  async updateTransactionStatus(id: string, data: { status: string; processed_by?: string; admin_memo?: string; reject_reason?: string }) {
    return apiFetch(`/db/transactions/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  // ==================== 대시보드 통계 (DB) ====================
  async getDbStats() {
    return apiFetch('/db/stats');
  },

  // ==================== KV 기반 레거시 ====================
  async getMembers() {
    return apiFetch('/members');
  },

  async getMember(id: string) {
    return apiFetch(`/members/${id}`);
  },

  async createMember(data: any) {
    return apiFetch('/members', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateMember(id: string, data: any) {
    return apiFetch(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteMember(id: string) {
    return apiFetch(`/members/${id}`, { method: 'DELETE' });
  },

  async getTransactions() {
    return apiFetch('/transactions');
  },

  async createTransaction(data: any) {
    return apiFetch('/transactions', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateTransaction(id: string, data: any) {
    return apiFetch(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async getBets() {
    return apiFetch('/bets');
  },

  async createBet(data: any) {
    return apiFetch('/bets', { method: 'POST', body: JSON.stringify(data) });
  },

  async getStats() {
    return apiFetch('/stats');
  },

  async initData() {
    return apiFetch('/init-data', { method: 'POST' });
  },

  // ==================== 게임사 관리 ====================
  async getProviders(type: 'invest' | 'honor') {
    return apiFetch(`/providers/${type}`);
  },

  async getProvider(type: 'invest' | 'honor', id: string) {
    return apiFetch(`/providers/${type}/${id}`);
  },

  async createProvider(type: 'invest' | 'honor', data: any) {
    return apiFetch(`/providers/${type}`, { method: 'POST', body: JSON.stringify(data) });
  },

  async updateProvider(type: 'invest' | 'honor', id: string, data: any) {
    return apiFetch(`/providers/${type}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteProvider(type: 'invest' | 'honor', id: string) {
    return apiFetch(`/providers/${type}/${id}`, { method: 'DELETE' });
  },

  // ==================== 게임 관리 ====================
  async getGames(type: 'invest' | 'honor', providerId?: string) {
    const qs = providerId ? `?provider_id=${providerId}` : '';
    return apiFetch(`/games/${type}${qs}`);
  },

  async getGame(type: 'invest' | 'honor', id: string) {
    return apiFetch(`/games/${type}/${id}`);
  },

  async createGame(type: 'invest' | 'honor', data: any) {
    return apiFetch(`/games/${type}`, { method: 'POST', body: JSON.stringify(data) });
  },

  async updateGame(type: 'invest' | 'honor', id: string, data: any) {
    return apiFetch(`/games/${type}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteGame(type: 'invest' | 'honor', id: string) {
    return apiFetch(`/games/${type}/${id}`, { method: 'DELETE' });
  },

  // ==================== 게임 실행 URL ====================
  async launchGame(type: 'invest' | 'honor', gameId: string, userId: string, token?: string) {
    return apiFetch(`/games/${type}/${gameId}/launch`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, token }),
    });
  },

  // ==================== 레벨별 게임사 할당 ====================
  async getLevelProviderAssignments() {
    return apiFetch('/level-provider-assignments');
  },

  async updateLevelProviderAssignment(level: number, data: { provider_ids: string[] }) {
    return apiFetch(`/level-provider-assignments/${level}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // ==================== 회원가입 ====================
  async signup(data: { username: string; password: string; name: string; phone?: string; bank_name?: string; account_number?: string; referral_code?: string }) {
    return apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(data) });
  },

  // ==================== 고객센터 티켓 ====================
  async getSupportTickets(params?: { user_id?: string; status?: string; page?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.user_id) qs.set('user_id', params.user_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiFetch(`/support-tickets?${qs}`);
  },

  async createSupportTicket(data: { user_id: string; username: string; category: string; title: string; content: string }) {
    return apiFetch('/support-tickets', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateSupportTicket(id: string, data: { answer?: string; status?: string; answered_by?: string }) {
    return apiFetch(`/support-tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  // ==================== 어드민 알림 집계 ====================
  async getAdminNotifications() {
    return apiFetch('/db/notifications');
  },

  // ==================== 공지사항 ====================
  async getNotices(publishedOnly = false) {
    return apiFetch(`/notices${publishedOnly ? '?published=true' : ''}`);
  },

  async createNotice(data: { title: string; content: string; type?: string; is_pinned?: boolean; is_published?: boolean; author_name?: string }) {
    return apiFetch('/notices', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateNotice(id: string, data: Partial<{ title: string; content: string; type: string; is_pinned: boolean; is_published: boolean }>) {
    return apiFetch(`/notices/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteNotice(id: string) {
    return apiFetch(`/notices/${id}`, { method: 'DELETE' });
  },

  async incrementNoticeView(id: string) {
    return apiFetch(`/notices/${id}/view`, { method: 'PATCH' });
  },

  // ==================== 메시지 ====================
  async getMessages(recipientId?: string) {
    const qs = recipientId ? `?recipient_id=${recipientId}` : '';
    return apiFetch(`/messages${qs}`);
  },

  async getSentMessages() {
    return apiFetch('/messages/sent');
  },

  async sendMessage(data: { title: string; content: string; recipient_id?: string; sender_name?: string }) {
    return apiFetch('/messages', { method: 'POST', body: JSON.stringify(data) });
  },

  async markMessageRead(id: string) {
    return apiFetch(`/messages/${id}/read`, { method: 'PATCH' });
  },

  async getMessageStats() {
    return apiFetch('/messages/stats');
  },

  // ==================== 배너 ====================
  async getBanners(params?: { active?: boolean; position?: string }) {
    const qs = new URLSearchParams();
    if (params?.active) qs.set('active', 'true');
    if (params?.position) qs.set('position', params.position);
    return apiFetch(`/banners?${qs}`);
  },

  async createBanner(data: { title: string; image_url?: string; link_url?: string; position?: string; display_order?: number; is_active?: boolean; metadata?: Record<string, any> }) {
    return apiFetch('/banners', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateBanner(id: string, data: Partial<{ title: string; image_url: string; link_url: string; position: string; display_order: number; is_active: boolean; metadata: Record<string, any> }>) {
    return apiFetch(`/banners/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  async deleteBanner(id: string) {
    return apiFetch(`/banners/${id}`, { method: 'DELETE' });
  },
};
