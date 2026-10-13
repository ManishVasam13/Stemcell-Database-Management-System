import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import Transplants from './pages/Transplants';
import Samples from './pages/Samples';
import SampleDetail from './pages/SampleDetail';
import Donors from './pages/Donors';
import DonorDetail from './pages/DonorDetail';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Storage from './pages/Storage';
import Hospitals from './pages/Hospitals';
import Doctors from './pages/Doctors';
import Users from './pages/Users';
import Audit from './pages/Audit';
import Inventory from './pages/Inventory';
import DonorPortal from './pages/DonorPortal';
import PatientPortal from './pages/PatientPortal';

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading what="Starting StemVault" />;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const home = user.role === 'DONOR' ? <DonorPortal /> : user.role === 'PATIENT' ? <PatientPortal /> : <Dashboard />;

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={home} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="transplants" element={<Transplants />} />
        <Route path="samples" element={<Samples />} />
        <Route path="samples/:id" element={<SampleDetail />} />
        <Route path="donors" element={<Donors />} />
        <Route path="donors/:id" element={<DonorDetail />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="storage" element={<Storage />} />
        <Route path="hospitals" element={<Hospitals />} />
        <Route path="doctors" element={<Doctors />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
