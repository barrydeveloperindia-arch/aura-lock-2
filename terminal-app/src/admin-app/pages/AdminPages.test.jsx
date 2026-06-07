import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import Sidebar from '../components/Sidebar';
import Layout from '../components/Layout';

const renderWithRouter = (ui) => {
    return render(ui, { wrapper: MemoryRouter });
};

describe('Admin Panel Pages Logo Regression Test', () => {
    it('renders the smooth Englabs logo Bezier path in Home page', () => {
        const { container } = renderWithRouter(<Home />);
        const path = container.querySelector('svg path');
        expect(path).toBeInTheDocument();
        const d = path.getAttribute('d');
        expect(d).toContain('C 11.78 58.05');
        expect(d).toContain('C 56.86 24.34');
        expect(d).not.toContain('L 57.58 24.91');
        expect(d).not.toContain('L 59.50 27.28');
    });

    it('renders the smooth Englabs logo Bezier path in Layout component', () => {
        const { container } = renderWithRouter(<Layout />);
        const path = container.querySelector('svg path');
        expect(path).toBeInTheDocument();
        const d = path.getAttribute('d');
        expect(d).toContain('C 11.78 58.05');
        expect(d).toContain('C 56.86 24.34');
        expect(d).not.toContain('L 57.58 24.91');
        expect(d).not.toContain('L 59.50 27.28');
    });

    it('renders the smooth Englabs logo Bezier path in Sidebar component', () => {
        const { container } = renderWithRouter(<Sidebar isOpen={true} onClose={() => {}} />);
        const path = container.querySelector('svg path');
        expect(path).toBeInTheDocument();
        const d = path.getAttribute('d');
        expect(d).toContain('C 11.78 58.05');
        expect(d).toContain('C 56.86 24.34');
        expect(d).not.toContain('L 57.58 24.91');
        expect(d).not.toContain('L 59.50 27.28');
    });
});
