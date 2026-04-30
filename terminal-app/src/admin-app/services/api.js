import axios from 'axios';

const api = axios.create({
    // HARDCODED IP FOR RELIABILITY ON MOBILE
    baseURL: 'http://192.168.2.117:8000', 
    headers: {
        'Content-Type': 'application/json'
    }
});

// Inject token into every request if it exists
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('aura_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`📡 [API Request] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
});

// Auto-logout on token expiration (401/403)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Token expired or invalid
            localStorage.removeItem('aura_token');
            localStorage.removeItem('aura_user');
            if (!window.location.hash.includes('#/admin')) {
                window.location.hash = '#/admin';
            }
        }
        return Promise.reject(error);
    }
);

export const apiService = {
    // Auth
    login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        if (response.data.token) {
            localStorage.setItem('aura_token', response.data.token);
            localStorage.setItem('aura_user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('aura_token');
        localStorage.removeItem('aura_user');
        window.location.hash = '#/admin';
    },

    // Face Registration
    registerFace: async (imageBlob, employeeId, email, name, reEnroll = false) => {
        const formData = new FormData();
        formData.append('file', imageBlob, 'register.jpg');
        formData.append('employeeId', employeeId);
        formData.append('email', email);
        if (name) formData.append('name', name);
        if (reEnroll) formData.append('re_enroll', 'true');  // bypass duplicate-ID guard

        console.log(`📤 Sending face registration for: ${employeeId} (re_enroll=${reEnroll})`);
        const response = await api.post('/api/biometrics/face/register', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    // Employees
    createEmployee: async (employeeData) => {
        const response = await api.post('/api/users', employeeData);
        return response.data;
    },

    getUsers: async () => {
        const response = await api.get('/api/users');
        return response.data;
    },

    getDepartments: async () => {
        const response = await api.get('/api/departments');
        return response.data;
    },

    updateUser: async (id, userData) => {
        const response = await api.patch(`/api/users/${id}`, userData);
        return response.data;
    },

    disableUser: async (id) => {
        const response = await api.patch(`/api/users/${id}`, { status: 'Disabled' });
        return response.data;
    },

    enableUser: async (id) => {
        const response = await api.patch(`/api/users/${id}`, { status: 'Active' });
        return response.data;
    },

    deleteUser: async (id, hard = false) => {
        const response = await api.delete(`/api/users/${id}${hard ? '?hard=true' : ''}`);
        return response.data;
    },

    // Logs
    getAccessLogs: async (params = {}) => {
        const response = await api.get('/api/access-logs', { params });
        return response.data;
    },

    getEmployeeAccessLogs: async (employeeId, params) => {
        // Ensure status filter is passed correctly if provided
        const queryParams = { ...params };
        if (queryParams.status === 'All') delete queryParams.status;
        const response = await api.get(`/api/access-logs/employee/${employeeId}`, { params: queryParams });
        return response.data;
    },

    getEmployeeAccessSummary: async (employeeId) => {
        const response = await api.get(`/api/access-logs/employee/${employeeId}/summary`);
        return response.data;
    },

    exportAccessLogsExcel: async (params) => {
        const endpoint = params?.employeeId 
            ? `/api/access-logs/export/excel/${params.employeeId}`
            : '/api/access-logs/export/excel';
        const response = await api.get(endpoint, {
            params,
            responseType: 'blob'
        });
        return response.data;
    },

    exportAccessLogsPDF: async (params) => {
        const endpoint = params?.employeeId 
            ? `/api/access-logs/export/pdf/${params.employeeId}`
            : '/api/access-logs/export/pdf';
        const response = await api.get(endpoint, {
            params,
            responseType: 'blob'
        });
        return response.data;
    },

    // Stats
    getDashboardStats: async () => {
        const response = await api.get('/api/stats');
        return response.data;
    },

    getActivityStats: async () => {
        const response = await api.get('/api/stats/activity');
        return response.data;
    },

    getAttendanceAnalytics: async () => {
        const response = await api.get('/api/stats/attendance-analytics');
        return response.data;
    },

    // Attendance
    getAttendance: async (params) => {
        const response = await api.get('/api/attendance', { params });
        return response.data;
    },

    getAttendanceReport: async () => {
        const response = await api.get('/api/attendance/report');
        return response.data;
    },

    getMonthlyReport: async (month, year) => {
        const response = await api.get('/api/attendance/monthly-report', { params: { month, year } });
        return response.data;
    },

    exportAttendanceExcel: async (params) => {
        const response = await api.get('/api/attendance/export/excel', {
            params,
            responseType: 'blob'
        });
        return response.data;
    },

    exportAttendancePDF: async (params) => {
        const response = await api.get('/api/attendance/export/pdf', {
            params,
            responseType: 'blob'
        });
        return response.data;
    },
    
    getEmployeeAttendance: async (employeeId, params) => {
        const response = await api.get(`/api/attendance/employee/${employeeId}`, { params });
        return response.data;
    },

    getEmployeeAttendanceSummary: async (employeeId, params) => {
        const response = await api.get(`/api/attendance/employee/${employeeId}/summary`, { params });
        return response.data;
    },

    exportEmployeeAttendanceExcel: async (employeeId, params) => {
        console.log(`📡 Exporting Excel for ${employeeId} with params:`, params);
        const response = await api.get(`/api/attendance/export/excel${employeeId ? `/${employeeId}` : ''}`, {
            params,
            responseType: 'blob'
        });
        return response.data;
    },

    exportEmployeeAttendancePDF: async (employeeId, params) => {
        console.log(`📡 Exporting PDF for ${employeeId} with params:`, params);
        const response = await api.get(`/api/attendance/export/pdf${employeeId ? `/${employeeId}` : ''}`, {
            params,
            responseType: 'blob'
        });
        return response.data;
    },

    // Door Control
    unlockDoor: async () => {
        const response = await api.post('/api/door/unlock');
        return response.data;
    },

    getDoorStatus: async () => {
        const response = await api.get('/api/door/status');
        return response.data;
    },

    getDeviceInfo: async () => {
        const response = await api.get('/api/door/device');
        return response.data;
    },

    // BLE Management (New)
    scanBleDevices: async () => {
        const response = await api.get('/api/ble/scan');
        return response.data;
    },

    getBleStatus: async () => {
        const response = await api.get('/api/ble/status');
        return response.data;
    },

    lockDoor: async () => {
        const response = await api.post('/api/door/lock');
        return response.data;
    },

    testRelay: async () => {
        const response = await api.post('/api/door/test');
        return response.data;
    },

    rebuildCache: async () => {
        const response = await api.post('/api/door/rebuild-cache');
        return response.data;
    },

    clearLogs: async () => {
        const response = await api.post('/api/door/clear-logs');
        return response.data;
    },

    updateAdminCredentials: async (newEmail, newPassword) => {
        const response = await api.post('/api/system/update-credentials', { newEmail, newPassword });
        return response.data;
    }
};

export default api;
