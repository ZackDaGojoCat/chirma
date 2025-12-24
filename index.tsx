import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode can sometimes cause double-renders which complicates 
  // raw PeerJS/Canvas initialization in dev, but we'll keep it for best practices.
  // The Game logic handles cleanup.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);