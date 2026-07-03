import React from 'react';
import ReactDOM from 'react-dom/client';
import { StreamlitPivotParrot } from './StreamlitPivotParrot';
import 'pivot-parrot/base-reset.css';
import './streamlit-overrides.css';
import 'pivot-parrot/sidebar/styles.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <StreamlitPivotParrot />
  </React.StrictMode>
);
