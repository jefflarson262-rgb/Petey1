import { memo } from 'react';
import { APP_MARKUP } from './markup/index.js';
import AccessCodeDialog from './components/AccessCodeDialog.jsx';

// The prototype's screens are plain HTML that its own scripts manage (they rewrite parts of it constantly).
// React must therefore render this markup once and never touch it again, hence memo() with no props.
const PrototypeMarkup = memo(function PrototypeMarkup() {
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: APP_MARKUP }} />;
});

export default function App() {
  return (
    <>
      <PrototypeMarkup />
      <AccessCodeDialog />
    </>
  );
}
