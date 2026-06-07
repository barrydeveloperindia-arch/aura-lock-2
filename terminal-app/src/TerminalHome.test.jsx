import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TerminalHome from './TerminalHome';

const renderWithRouter = (ui) => {
    return render(ui, { wrapper: MemoryRouter });
};

describe('TerminalHome Component Logo Regression Test', () => {
    it('renders the smooth Englabs logo Bezier paths', () => {
        const { container } = renderWithRouter(<TerminalHome />);
        
        // Find all SVG paths in the rendered document
        const paths = container.querySelectorAll('svg path');
        expect(paths.length).toBeGreaterThanOrEqual(1);
        
        // Filter the paths matching the start of the cursive swirl logo path
        const logoPaths = Array.from(paths).filter(p => {
            const d = p.getAttribute('d') || '';
            return d.startsWith('M 11.9 57.65');
        });
        
        // Verify we found the logo path instances (standby logo and top bar logo)
        expect(logoPaths.length).toBeGreaterThanOrEqual(1);
        
        logoPaths.forEach(path => {
            const d = path.getAttribute('d');
            
            // Assert the path is the smooth curve path (contains cubic Beziers 'C')
            expect(d).toContain('C 11.78 58.05');
            expect(d).toContain('C 56.86 24.34');
            
            // Assert it does not contain the blocky L segment fallback patterns
            expect(d).not.toContain('L 57.58 24.91');
            expect(d).not.toContain('L 59.50 27.28');
        });
    });
});
