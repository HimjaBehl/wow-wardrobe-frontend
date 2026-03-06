# Overview

WOW Wardrobe UI is a modern web application for managing a personal wardrobe and outfit planning. Built with React and Vite, it provides a clean, minimalist interface for users to organize their clothing items and plan outfits using an interactive calendar system. The application features a wardrobe management system with image handling capabilities and integrates with Firebase for authentication and data storage.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React 18** with functional components and hooks for the main UI framework
- **Vite** as the build tool providing fast development with Hot Module Reloading
- **React Router DOM** for client-side navigation between wardrobe and planner views
- **CSS Modules approach** with separate stylesheets for different components (App.css, Wardrobe.css, Planner.css)
- **Progressive Web App (PWA)** features with service worker and manifest for offline capabilities

## State Management
- React's built-in state management using hooks (useState, useEffect)
- No external state management library, keeping the architecture simple

## UI Components
- **Fabric.js** integration for advanced canvas-based image manipulation
- **React Calendar** component for outfit planning and date selection
- **Lucide React** for consistent iconography throughout the application
- Custom CSS with CSS variables for a cohesive design system using neutral colors and accent colors (pink and gold)

## Authentication System
- **Firebase Authentication** with Google OAuth provider
- Simple sign-in/sign-out flow integrated into the main application

## Image Handling
- **Fabric.js** for client-side image editing and canvas manipulation
- Integration with Firebase Storage for image uploads and retrieval

## Build Configuration
- **Vite configuration** optimized for Replit hosting with allowedHosts setting
- **Code splitting** implemented with manual chunks for vendor libraries, fabric.js, and router
- **TypeScript support** available but currently using JSX files

# External Dependencies

## Firebase Services
- **Firebase Authentication** - Google OAuth sign-in/sign-out
- **Firebase Firestore** - NoSQL database for storing wardrobe items and user data
- **Firebase Storage** - Cloud storage for clothing item images

## Key Libraries
- **React** (v18.2.0) - Core UI framework
- **React Router DOM** (v7.6.2) - Client-side routing
- **Fabric.js** (v5.3.0) - Canvas-based image editing and manipulation
- **React Calendar** (v3.7.0) - Calendar component for outfit planning
- **Lucide React** (v0.523.0) - Icon library

## Development Tools
- **Vite** (v5.0.0) - Build tool and development server
- **@vitejs/plugin-react** - React integration for Vite

## Hosting Platform
- **Replit** - Configured specifically for Replit hosting environment with appropriate server settings

# Key Features

## Style a Piece (Anchor Upload)
- Available on both **Home page** and **Style page**
- User uploads a photo or captures with camera
- Image is uploaded to Firebase Storage, then auto-tagged via `/auto-tag` endpoint
- Tagged item is saved to wardrobe via `/wardrobe` POST
- On Style page: user manually triggers Tina styling via "Style this piece" button
- On Home page: styling triggers automatically after upload, result appears in hero outfit section
- `suggestOutfitAgent` sends `anchor_item` + constraint text to `/suggest-outfit`
- State: `anchorItem`, `anchorUploading`, `anchorPreview` in App.jsx
- CSS classes: `.anchor-piece__*` for Style page, `.home-style-piece*` for Home page
- Firebase Storage bucket: `wowapp1406.firebasestorage.app`