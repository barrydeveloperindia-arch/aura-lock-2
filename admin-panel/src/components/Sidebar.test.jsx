import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

const renderWithRouter = (ui) => render(ui, { wrapper: BrowserRouter });

describe('Sidebar branding', () => {
    it('shows the official Englabs logo and the main navigation', () => {
        renderWithRouter(<Sidebar isOpen={true} onClose={vi.fn()} />);
        const logo = screen.getByRole('img', { name: /englabs/i });
        expect(logo).toBeInTheDocument();
        expect(logo.getAttribute('src')).toMatch(/englabs_logo/);
        for (const label of ['Dashboard', 'Employees', 'Attendance', 'Reports', 'Access Logs', 'Door Control', 'Settings']) {
            expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
        }
    });
});
