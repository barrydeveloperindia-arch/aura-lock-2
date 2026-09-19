import { describe, it, expect } from 'vitest';
import { filterPalette, PAGES } from '../lib/palette';

const users = [
    { id: '1', employee_id: 'EL018', name: 'Anurag Sahni', department: 'Mechanical Engineering', designation: 'Manager', company: 'Englabs India Pvt Ltd' },
    { id: '2', employee_id: 'EL101', name: 'Rampreet Singh', department: 'Workshop', designation: 'Painter', company: 'Englabs India Pvt Ltd' },
    { id: '3', employee_id: 'EL043', name: 'Hafeez', department: 'Maintenance', designation: 'Electrician', company: 'Sky5 Hotel' },
];

describe('filterPalette', () => {
    it('with no query lists every page and no people', () => {
        const r = filterPalette('', users);
        expect(r).toHaveLength(PAGES.length);
        expect(r.every(x => x.kind === 'page')).toBe(true);
    });
    it('finds staff by name and jumps to their attendance page', () => {
        const r = filterPalette('anurag', users);
        expect(r[0]).toMatchObject({ kind: 'person', title: 'Anurag Sahni', path: '/admin/attendance/employee/EL018' });
    });
    it('finds staff by employee ID, case-insensitively', () => {
        expect(filterPalette('el101', users)[0].title).toBe('Rampreet Singh');
    });
    it('matches company and department too', () => {
        expect(filterPalette('sky5', users).find(x => x.kind === 'person').title).toBe('Hafeez');
    });
    it('matches pages by name or hint', () => {
        expect(filterPalette('who changed', users).some(x => x.path === '/admin/audit')).toBe(true);
        expect(filterPalette('absent', users).some(x => x.path === '/admin/attendance?view=absent')).toBe(true);
    });
    it('returns nothing for a query that matches nothing', () => {
        expect(filterPalette('zzzz', users)).toHaveLength(0);
    });
});
