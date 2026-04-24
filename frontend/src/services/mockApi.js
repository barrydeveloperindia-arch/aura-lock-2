
const API_URL = 'http://localhost:5000/api';

const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const mockApi = {
    // --- Auth handled in context, keeping here if needed for direct calls ---

    // --- Data ---
    getUsers: async () => {
        const res = await fetch(`${API_URL}/users`, { headers: getHeaders() });
        return res.json();
    },

    addUser: async (userData) => {
        const res = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(userData)
        });
        return res.json();
    },

    getLogs: async () => {
        const res = await fetch(`${API_URL}/logs`, { headers: getHeaders() });
        return res.json();
    },

    getDevices: async () => {
        const res = await fetch(`${API_URL}/devices`, { headers: getHeaders() });
        return res.json();
    },

    unlockDoor: async (deviceId) => {
        const res = await fetch(`${API_URL}/devices/${deviceId}/unlock`, {
            method: 'POST',
            headers: getHeaders()
        });
        return res.json();
    },

    // --- Terminal Calls (Public/Mocked fallback for demo consistency if backend down, but trying real) --
    // We'll use the public endpoint we created in server.js
    verifyFace: async () => {
        const res = await fetch('http://localhost:5000/api/verify-face', { method: 'POST' });
        if (!res.ok) throw new Error('Face not recognized');
        return res.json();
    },

    verifyFingerprint: async () => {
        // keeping mock for latency simulation or separate endpoint
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                Math.random() > 0.1 ? resolve({ user: { name: 'Admin User' } }) : reject();
            }, 1500);
        });
    },

    verifyIdCard: async (code) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                Math.random() > 0.1 ? resolve({ user: { name: 'John Doe' } }) : reject();
            }, 1000);
        });
    }
};
