import React from 'react';
import logo from '../assets/englabs_logo.png';

/**
 * The official Englabs logo (loop mark + "Englabs" wordmark), same asset as the
 * Englabs Projects web app. Use `variant="mark"` for a compact square crop of
 * just the loop, e.g. in the sidebar; default renders the full logo.
 */
export default function BrandLogo({ variant = 'full', className = '', title = 'Englabs' }) {
    if (variant === 'mark') {
        // The PNG is square with the loop in the upper 60%; crop to the loop.
        return (
            <span className={`inline-block overflow-hidden ${className}`} role="img" aria-label={title}>
                <img
                    src={logo}
                    alt=""
                    className="w-full h-auto block scale-[1.9] origin-top translate-y-[-8%]"
                    draggable="false"
                />
            </span>
        );
    }
    return <img src={logo} alt={title} className={className} draggable="false" />;
}
