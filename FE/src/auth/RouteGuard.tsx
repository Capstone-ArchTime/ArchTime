import { Button, Result, Spin } from 'antd';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';
import { canAccess, roleHome } from './permissions';

export default function RouteGuard() {
  const { user, loading, error, retry, signOut } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-[#080b0e] flex items-center justify-center" role="status" aria-label="Verifying session"><Spin size="large" /></div>;
  if (error) return <div className="min-h-screen bg-[#080b0e] p-8"><Result status="warning" title="Session verification unavailable" subTitle={error} extra={<><Button type="primary" onClick={retry}>Retry</Button><Button onClick={signOut}>Back to sign in</Button></>} /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (!canAccess(user.role, location.pathname)) return <div className="min-h-screen bg-[#080b0e] p-8"><Result status="403" title="Access denied" subTitle="Your role does not have permission to access this workspace." extra={<Link to={roleHome[user.role]}><Button type="primary">Return to my workspace</Button></Link>} /></div>;
  return <Outlet key={user.id} />;
}
