import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from './Login';

const renderWithRouter = (ui) => render(ui, { wrapper: BrowserRouter });

describe('Login page branding', () => {
    it('shows the official Englabs logo and a plain sign-in form', () => {
        renderWithRouter(<Login />);
        const logo = screen.getByRole('img', { name: /englabs/i });
        expect(logo).toBeInTheDocument();
        expect(logo.getAttribute('src')).toMatch(/englabs_logo/);
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
});
