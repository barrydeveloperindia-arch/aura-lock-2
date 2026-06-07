import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

const renderWithRouter = (ui) => {
    return render(ui, { wrapper: BrowserRouter });
};

describe('Sidebar Component Logo Regression Test', () => {
    it('renders the smooth Englabs logo Bezier path', () => {
        const { container } = renderWithRouter(<Sidebar isOpen={true} onClose={vi.fn()} />);
        const path = container.querySelector('svg path');
        expect(path).toBeInTheDocument();
        
        const d = path.getAttribute('d');
        
        // Assert the path is the smooth curve path
        expect(d).toContain('C 11.78 58.05');
        expect(d).toContain('C 56.86 24.34');
        
        // Assert it does not contain the blocky L segment fallback patterns
        expect(d).not.toContain('L 57.58 24.91');
        expect(d).not.toContain('L 59.50 27.28');
    });
});
