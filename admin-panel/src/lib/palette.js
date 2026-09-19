export const PAGES = [
    { name: 'Dashboard', path: '/admin/dashboard', hint: 'Live overview' },
    { name: 'Employees', path: '/admin/users', hint: 'Personnel management' },
    { name: 'Building Directory', path: '/admin/building', hint: 'Floors and companies' },
    { name: 'Attendance', path: '/admin/attendance', hint: 'Attendance registry' },
    { name: 'Absent today', path: '/admin/attendance?view=absent', hint: 'Not checked in' },
    { name: 'Late today', path: '/admin/attendance?status=LATE', hint: 'Arrived after cutoff' },
    { name: 'Leaves & Holidays', path: '/admin/leaves', hint: 'Leave register' },
    { name: 'Live Map', path: '/admin/live-map', hint: 'Where staff are' },
    { name: 'Reports', path: '/admin/reports', hint: 'Analytics and monthly report' },
    { name: 'Access Logs', path: '/admin/logs', hint: 'Every scan attempt' },
    { name: 'Audit Trail', path: '/admin/audit', hint: 'Who changed what' },
    { name: 'Door Control', path: '/admin/door-control', hint: 'Lock and unlock' },
    { name: 'Face Calibration', path: '/admin/face-calibration', hint: 'Recognition tuning' },
    { name: 'Settings', path: '/admin/settings', hint: 'Live configuration' },
];

export function filterPalette(query, users) {
    const q = query.trim().toLowerCase();
    const pages = PAGES.filter(p => !q || p.name.toLowerCase().includes(q) || p.hint.toLowerCase().includes(q))
        .map(p => ({ kind: 'page', key: p.path, title: p.name, sub: p.hint, path: p.path }));
    const people = q
        ? users.filter(u => `${u.name || ''} ${u.employee_id || ''} ${u.department || ''} ${u.company || ''}`.toLowerCase().includes(q))
            .slice(0, 8)
            .map(u => ({
                kind: 'person', key: u.id || u.employee_id, title: u.name, sub: [u.employee_id, u.designation || u.department, u.company].filter(Boolean).join(' · '),
                path: `/admin/attendance/employee/${u.employee_id}`,
            }))
        : [];
    return [...people, ...pages.slice(0, q ? 6 : PAGES.length)];
}
