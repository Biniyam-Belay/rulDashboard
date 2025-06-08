import './App.css'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

// Placeholder components for routes
const HomePage = () => <div><h2>Home Page</h2><nav><Link to="/about">About</Link></nav></div>;
const AboutPage = () => <div><h2>About Page</h2><nav><Link to="/">Home</Link></nav></div>;

function App() {

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </Router>
  )
}

export default App
