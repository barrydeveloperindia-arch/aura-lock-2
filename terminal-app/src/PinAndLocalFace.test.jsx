import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock framer-motion to render synchronously (no animations in jsdom)
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }) => {
            const filteredProps = {};
            for (const [key, value] of Object.entries(props)) {
                if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'variants', 'layout', 'layoutId'].includes(key) && typeof value !== 'function' || key.startsWith('on') || key === 'className' || key === 'style' || key === 'key') {
                    filteredProps[key] = value;
                }
            }
            return <div {...filteredProps}>{children}</div>;
        },
        p: ({ children, ...props }) => <p className={props.className}>{children}</p>,
        button: ({ children, ...props }) => <button className={props.className} onClick={props.onClick}>{children}</button>,
        span: ({ children, ...props }) => <span className={props.className}>{children}</span>,
    },
    AnimatePresence: ({ children }) => <>{children}</>,
}));

// Override the global LocalFaceService mock for this test file
vi.mock('./LocalFaceService', () => ({
    localFaceService: {
        initialize: vi.fn().mockResolvedValue(undefined),
        syncDescriptors: vi.fn().mockResolvedValue(undefined),
        matchFace: vi.fn().mockResolvedValue({ matched: false }),
        enrollFace: vi.fn().mockResolvedValue(null),
        getStatus: vi.fn().mockReturnValue({ modelsLoaded: true, descriptorCount: 5, lastSync: new Date() }),
        storeDescriptors: vi.fn().mockResolvedValue(undefined),
    },
}));

import TerminalHome from './TerminalHome';

const renderApp = () => render(<TerminalHome />, { wrapper: MemoryRouter });

/** Helper to enter a 4-digit PIN and submit via keypad */
const enterPinAndSubmit = async (container, digits) => {
    for (const d of digits) {
        await act(async () => {
            const key = container.querySelector(`[data-testid="pin-key-${d}"]`);
            fireEvent.click(key);
        });
    }
    await act(async () => {
        const submitBtn = container.querySelector('[data-testid="pin-submit"]');
        if (submitBtn && !submitBtn.disabled) {
            fireEvent.click(submitBtn);
        }
    });
};

describe('Admin Unlock Door PIN Protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the Admin Unlock Door button on the home screen', async () => {
        let container;
        await act(async () => {
            const result = renderApp();
            container = result.container;
        });
        const buttons = container.querySelectorAll('button');
        const unlockBtn = Array.from(buttons).find(b => b.textContent.includes('Admin Unlock Door'));
        expect(unlockBtn).toBeTruthy();
    });

    it('shows PIN modal when Admin Unlock Door is tapped (not direct unlock)', async () => {
        let container;
        await act(async () => {
            const result = renderApp();
            container = result.container;
        });

        await act(async () => {
            const unlockBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Admin Unlock Door'));
            fireEvent.click(unlockBtn);
        });

        // Should show PIN entry UI with keypad
        const pinDisplay = container.querySelector('[data-testid="pin-display"]');
        expect(pinDisplay).toBeTruthy();

        // Keypad should be visible
        const key1 = container.querySelector('[data-testid="pin-key-1"]');
        expect(key1).toBeTruthy();
    });

    it('shows error message on wrong PIN', async () => {
        let container;
        await act(async () => {
            const result = renderApp();
            container = result.container;
        });

        await act(async () => {
            const unlockBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Admin Unlock Door'));
            fireEvent.click(unlockBtn);
        });

        // Enter wrong PIN: 1111
        await enterPinAndSubmit(container, ['1', '1', '1', '1']);

        await waitFor(() => {
            expect(container.textContent).toContain('Invalid PIN');
        });
    });

    it('has a cancel button that returns to home', async () => {
        let container;
        await act(async () => {
            const result = renderApp();
            container = result.container;
        });

        await act(async () => {
            const unlockBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Admin Unlock Door'));
            fireEvent.click(unlockBtn);
        });

        // Find cancel button
        const cancelBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
        expect(cancelBtn).toBeTruthy();

        await act(async () => {
            fireEvent.click(cancelBtn);
        });

        // Should be back on home
        const unlockBtnAgain = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Admin Unlock Door'));
        expect(unlockBtnAgain).toBeTruthy();
    });

    it('locks out after 3 failed attempts', async () => {
        let container;
        await act(async () => {
            const result = renderApp();
            container = result.container;
        });

        await act(async () => {
            const unlockBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Admin Unlock Door'));
            fireEvent.click(unlockBtn);
        });

        // Attempt 1: wrong PIN
        await enterPinAndSubmit(container, ['1', '1', '1', '1']);
        await waitFor(() => {
            expect(container.textContent).toContain('Invalid PIN');
        });

        // Attempt 2: wrong PIN
        await enterPinAndSubmit(container, ['3', '3', '3', '3']);
        await waitFor(() => {
            expect(container.textContent).toContain('Invalid PIN');
        });

        // Attempt 3: wrong PIN — should trigger lockout
        await enterPinAndSubmit(container, ['5', '5', '5', '5']);
        await waitFor(() => {
            expect(container.textContent).toContain('Too many failed attempts');
        });
    });
});

describe('Local Face Recognition Integration', () => {
    it('initializes local face service on mount', async () => {
        const { localFaceService } = await import('./LocalFaceService');
        await act(async () => {
            renderApp();
        });

        await waitFor(() => {
            expect(localFaceService.initialize).toHaveBeenCalled();
        });
    });

    it('syncs descriptors on mount', async () => {
        const { localFaceService } = await import('./LocalFaceService');
        await act(async () => {
            renderApp();
        });

        await waitFor(() => {
            expect(localFaceService.syncDescriptors).toHaveBeenCalled();
        });
    });
});
