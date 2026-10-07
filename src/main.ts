import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

// Replace the static loading placeholder from index.html.
target.replaceChildren();
mount(App, { target });
