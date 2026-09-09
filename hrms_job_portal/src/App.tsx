import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import JobDetails from './pages/JobDetails';
import Apply from './pages/Apply';
import Companies from './pages/Companies';
import CompanyDetails from './pages/CompanyDetails';
import Saved from './pages/Saved';
import Profile from './pages/Profile';
import Blogs from './pages/Blogs';
import BlogDetail from './pages/BlogDetail';
import Verify from './pages/Verify';
import Talent from './pages/Talent';
import TalentDetail from './pages/TalentDetail';
import Safety from './pages/Safety';
import Report from './pages/Report';
import PostJob from './pages/PostJob';
import RegisterCompany from './pages/RegisterCompany';
import NotFound from './pages/NotFound';

function App() {
  return (
    <ErrorBoundary>
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetails />} />
        <Route path="/jobs/:id/apply" element={<Apply />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetails />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/blogs" element={<Blogs />} />
        <Route path="/blogs/:id" element={<BlogDetail />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/talent" element={<Talent />} />
        <Route path="/talent/:id" element={<TalentDetail />} />
        <Route path="/safety" element={<Safety />} />
        <Route path="/report" element={<Report />} />
        <Route path="/post-job" element={<PostJob />} />
        <Route path="/register/company" element={<RegisterCompany />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
    </ErrorBoundary>
  );
}

export default App;
