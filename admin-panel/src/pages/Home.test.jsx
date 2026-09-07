import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from './Home';

const renderWithRouter = (ui) => render(ui, { wrapper: BrowserRouter });

describe('Home page branding', () => {
    it('shows the official Englabs logo and both entry points', () => {
        renderWithRouter(<Home />);
        const logo = screen.getByRole('img', { name: /englabs/i });
        expect(logo).toBeInTheDocument();
        expect(logo.getAttribute('src')).toMatch(/englabs_logo/);
        expect(screen.getByRole('button', { name: /attendance terminal/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /admin console/i })).toBeInTheDocument();
    });
});
