import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Cash Management V2</h1>
      <p>Electron App - Monorepo Architecture</p>
      <p>Status: Skeleton initialized ✅</p>
    </div>
  );
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
