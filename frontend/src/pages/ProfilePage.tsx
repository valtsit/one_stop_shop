import { useEffect, useState } from 'react';
import { fetchProfile, updateProfile, changePassword, type ProfileData } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role_id === 'role_super_admin' || authUser?.role_id === 'role_admin';
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile edit state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Password change state
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');

  useEffect(() => {
    fetchProfile()
      .then((data) => {
        setProfile(data);
        setDisplayName(data.display_name);
        setEmail(data.email);
        setPhone(data.phone);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    try {
      await updateProfile({ display_name: displayName, email, phone });
      setProfileMsg('个人信息已更新');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch {
      setProfileMsg('更新失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('新密码至少6个字符');
      return;
    }
    setSavingPwd(true);
    setPwdError('');
    setPwdMsg('');
    try {
      await changePassword(oldPwd, newPwd);
      setPwdMsg('密码已修改');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setTimeout(() => setPwdMsg(''), 3000);
    } catch (e: unknown) {
      setPwdError(e instanceof Error ? e.message : '修改密码失败');
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) {
    return (
      <div className="content-area">
        <div className="profile-page">加载中...</div>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="profile-page">
        <h1 className="profile-title">个人设置</h1>

        <div className="profile-section">
          <div className="profile-info-row">
            <span className="profile-label">用户名</span>
            <span className="profile-value">{profile?.username || authUser?.username}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-label">角色</span>
            <span className="profile-value">{profile?.role_name || '未分配'}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-label">部门</span>
            <span className="profile-value">{profile?.department_name || '未分配'}</span>
          </div>
        </div>

        <div className="profile-card">
          <h2 className="profile-card-title">基本信息</h2>
          {profileMsg && <div className="profile-msg">{profileMsg}</div>}
          <form className="profile-form" onSubmit={handleSaveProfile}>
            <div className="profile-form-field">
              <label htmlFor="display_name">显示名</label>
              <input
                id="display_name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="请输入显示名"
              />
            </div>
            <div className="profile-form-row">
              <div className="profile-form-field">
                <label htmlFor="email">邮箱</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                />
              </div>
              <div className="profile-form-field">
                <label htmlFor="phone">手机</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                />
              </div>
            </div>
            <div className="profile-form-actions">
              <button
                type="submit"
                className="profile-form-submit"
                disabled={savingProfile}
              >
                {savingProfile ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>

        {isAdmin && (
        <div className="profile-card">
          <h2 className="profile-card-title">修改密码</h2>
          {pwdMsg && <div className="profile-msg">{pwdMsg}</div>}
          {pwdError && <div className="profile-error">{pwdError}</div>}
          <form className="profile-form" onSubmit={handleChangePwd}>
            <div className="profile-form-field">
              <label htmlFor="old_password">当前密码</label>
              <input
                id="old_password"
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                placeholder="请输入当前密码"
                required
              />
            </div>
            <div className="profile-form-row">
              <div className="profile-form-field">
                <label htmlFor="new_password">新密码</label>
                <input
                  id="new_password"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="至少6个字符"
                  required
                />
              </div>
              <div className="profile-form-field">
                <label htmlFor="confirm_password">确认新密码</label>
                <input
                  id="confirm_password"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="再次输入新密码"
                  required
                />
              </div>
            </div>
            <div className="profile-form-actions">
              <button
                type="submit"
                className="profile-form-submit"
                disabled={savingPwd || !oldPwd || !newPwd || !confirmPwd}
              >
                {savingPwd ? '修改中...' : '修改密码'}
              </button>
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
