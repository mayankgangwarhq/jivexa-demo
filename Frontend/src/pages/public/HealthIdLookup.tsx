import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { 
  ShieldCheck, Search, QrCode, Lock, AlertTriangle, CheckCircle2, 
  PhoneCall, HeartPulse, UserCheck, Siren, Activity, Copy, Check, Info, Heart
} from 'lucide-react';
import { searchHealthIdApi } from '../../services/healthIdService';

interface PatientEmergencyProfile {
  registeredName: string;
  healthId: string;
  ageOrDob: string;
  gender: string;
  bloodGroup: string;
  allergies: string;
  emergencyMedicalInfo: string;
  emergencyContact: string;
  verificationStatus: string;
  verifiedAt: string;
}

export const HealthIdLookup: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<PatientEmergencyProfile | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeSearchMode, setActiveSearchMode] = useState<'id' | 'qr'>('id');

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearch = async (e?: React.FormEvent, sampleId?: string) => {
    if (e) e.preventDefault();
    const rawTarget = sampleId || query;
    const searchQuery = rawTarget.trim().toUpperCase();

    if (!searchQuery) {
      setError('Please enter a valid Health ID (e.g. JIV-2026-685853 or JXV-STVAZREW).');
      setProfile(null);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await searchHealthIdApi(searchQuery);
      setLoading(false);

      if (res.success && res.patient) {
        const p = res.patient;

        // 1. Registered Name
        const registeredName = (p.name && String(p.name).trim()) ? String(p.name).trim() : 'Not provided';

        // 2. Health ID
        const healthId = res.healthId || searchQuery;

        // 3. Age or Date of Birth
        let ageOrDob = 'Not provided';
        if (p.dateOfBirth && String(p.dateOfBirth).trim() !== '') {
          const dobDate = new Date(p.dateOfBirth);
          if (!isNaN(dobDate.getTime())) {
            const currentYear = new Date().getFullYear();
            const birthYear = dobDate.getFullYear();
            const calculatedAge = currentYear - birthYear;
            if (calculatedAge >= 0 && calculatedAge < 130) {
              ageOrDob = `${calculatedAge} Yrs (DOB: ${p.dateOfBirth})`;
            } else {
              ageOrDob = `DOB: ${p.dateOfBirth}`;
            }
          } else {
            ageOrDob = String(p.dateOfBirth);
          }
        }

        // Gender (optional supplementary)
        const gender = (p.gender && String(p.gender).trim() && p.gender !== 'Unspecified') 
          ? String(p.gender).trim() 
          : 'Not provided';

        // 4. Blood Group
        const bloodGroup = (p.bloodGroup && String(p.bloodGroup).trim()) 
          ? String(p.bloodGroup).trim() 
          : 'Not provided';

        // 5. Critical Allergies
        let allergies = 'Not provided';
        if (p.healthProfile?.allergies) {
          if (Array.isArray(p.healthProfile.allergies)) {
            const valid = p.healthProfile.allergies.filter((a: any) => Boolean(a) && String(a).trim());
            allergies = valid.length > 0 ? valid.join(', ') : 'Not provided';
          } else if (typeof p.healthProfile.allergies === 'string' && p.healthProfile.allergies.trim()) {
            allergies = p.healthProfile.allergies.trim();
          }
        }

        // 6. Relevant Emergency Medical Information
        let emergencyMedicalInfo = 'Not provided';
        if (p.healthProfile?.chronicConditions) {
          if (Array.isArray(p.healthProfile.chronicConditions)) {
            const valid = p.healthProfile.chronicConditions.filter((c: any) => Boolean(c) && String(c).trim());
            emergencyMedicalInfo = valid.length > 0 ? valid.join(', ') : 'Not provided';
          } else if (typeof p.healthProfile.chronicConditions === 'string' && p.healthProfile.chronicConditions.trim()) {
            emergencyMedicalInfo = p.healthProfile.chronicConditions.trim();
          }
        } else if (p.healthProfile?.emergencyNotes && typeof p.healthProfile.emergencyNotes === 'string') {
          emergencyMedicalInfo = p.healthProfile.emergencyNotes.trim();
        }

        // 7. Emergency Contact Name & Phone
        let emergencyContactDisplay = 'Not provided';
        if (p.emergencyContact) {
          if (typeof p.emergencyContact === 'object') {
            const contactName = p.emergencyContact.name ? String(p.emergencyContact.name).trim() : '';
            const contactPhone = p.emergencyContact.phone ? String(p.emergencyContact.phone).trim() : '';
            const relationship = p.emergencyContact.relationship ? ` (${p.emergencyContact.relationship})` : '';

            if (contactName && contactPhone) {
              emergencyContactDisplay = `${contactName}${relationship} • ${contactPhone}`;
            } else if (contactName) {
              emergencyContactDisplay = `${contactName}${relationship}`;
            } else if (contactPhone) {
              emergencyContactDisplay = contactPhone;
            }
          } else if (typeof p.emergencyContact === 'string' && p.emergencyContact.trim()) {
            emergencyContactDisplay = p.emergencyContact.trim();
          }
        }

        // 8. Verification Status
        const verificationStatus = res.verificationStatus || 'Verified Active Record';

        setProfile({
          registeredName,
          healthId,
          ageOrDob,
          gender,
          bloodGroup,
          allergies,
          emergencyMedicalInfo,
          emergencyContact: emergencyContactDisplay,
          verificationStatus,
          verifiedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });
      } else {
        setProfile(null);
        setError(res.message || `Health ID "${searchQuery}" not found. No registered patient record exists with this ID.`);
      }
    } catch (err: any) {
      setLoading(false);
      setProfile(null);
      setError('Backend service unavailable or network connection failed. Please ensure the local backend server is running.');
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '32px', boxSizing: 'border-box' }}>
      
      {/* SIGNATURE EMERGENCY HEADER BANNER */}
      <div style={{
        width: '100%',
        background: 'linear-gradient(135deg, #0284c7 0%, #0f766e 50%, #059669 100%)',
        borderRadius: '24px',
        padding: '36px 32px',
        color: 'white',
        boxShadow: '0 20px 40px -15px rgba(15, 118, 110, 0.35)',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
        {/* Ambient Glow */}
        <div style={{
          position: 'absolute',
          top: '-30%',
          right: '-10%',
          width: '340px',
          height: '340px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center', alignItems: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(10px)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
            <ShieldCheck size={36} />
          </div>

          <span style={{
            fontSize: '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            padding: '4px 14px',
            borderRadius: '12px',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.25)'
          }}>
            🚑 JIVEXA HEALTH OS • PUBLIC EMERGENCY VERIFICATION PORTAL
          </span>

          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
            Public Health ID Emergency Lookup
          </h1>

          <p style={{ color: '#e0f2fe', fontSize: '0.96rem', margin: 0, maxWidth: '640px', lineHeight: '1.6' }}>
            Instantly verify registered patient details, emergency blood group, critical allergies, and emergency kin contacts. Full clinical records remain encrypted and consent-protected.
          </p>
        </div>
      </div>

      {/* SEARCH INPUT CARD WITH SEARCH TABS */}
      <Card style={{ padding: '32px', borderRadius: '24px', boxShadow: 'var(--shadow-xl)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setActiveSearchMode('id')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: activeSearchMode === 'id' ? '#0f766e' : 'var(--surface-raised)',
                  color: activeSearchMode === 'id' ? 'white' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Search size={16} />
                Search by Health ID (JHID)
              </button>

              <button
                type="button"
                onClick={() => setActiveSearchMode('qr')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: activeSearchMode === 'qr' ? '#0f766e' : 'var(--surface-raised)',
                  color: activeSearchMode === 'qr' ? 'white' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <QrCode size={16} />
                Scan Patient QR Badge
              </button>
            </div>

            <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={14} /> 24/7 Real-Time Node Active
            </span>
          </div>

          {activeSearchMode === 'id' ? (
            <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Enter Jivexa Health ID (JHID):
              </label>
              
              <div style={{ display: 'flex', gap: '12px' }} className="flex-col-mobile">
                <Input
                  placeholder="e.g. JXV-STVAZREWPAT-202608-F4A1B, JXV-STVAZREW, or JIV-2026-685853"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ height: '50px', fontSize: '1.05rem', fontWeight: 800, fontFamily: 'monospace' }}
                  icon={<Search size={20} style={{ color: '#0f766e' }} />}
                />
                <Button type="submit" isLoading={loading} style={{ height: '50px', borderRadius: '14px', padding: '0 32px', fontWeight: 900, backgroundColor: '#0f766e' }}>
                  Verify Health ID
                </Button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Try Verified Sample Demo Health IDs (Click to verify):
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 800, fontSize: '0.82rem' }}>
                    <ShieldCheck size={16} /> 256-Bit Encrypted Lookup
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => { setQuery('JXV-STVAZREWPAT-202608-F4A1B'); handleSearch(e, 'JXV-STVAZREWPAT-202608-F4A1B'); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(15, 118, 110, 0.1)',
                      border: '1.5px solid rgba(15, 118, 110, 0.35)',
                      color: '#0f766e',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Click to test sample demo ID JXV-STVAZREWPAT-202608-F4A1B"
                  >
                    <span>Sample Badge:</span> <strong>JXV-STVAZREWPAT-202608-F4A1B</strong>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { setQuery('JXV-STVAZREW'); handleSearch(e, 'JXV-STVAZREW'); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(2, 132, 199, 0.1)',
                      border: '1.5px solid rgba(2, 132, 199, 0.35)',
                      color: '#0284c7',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Click to test sample demo ID JXV-STVAZREW (Aarav Sharma)"
                  >
                    <span>Sample 1:</span> <strong>JXV-STVAZREW</strong> <span style={{ opacity: 0.75 }}>(Aarav • B+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { setQuery('PAT-202608-F4A1B'); handleSearch(e, 'PAT-202608-F4A1B'); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      border: '1.5px solid rgba(16, 185, 129, 0.35)',
                      color: '#059669',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Click to test sample demo ID PAT-202608-F4A1B (Meera Nair)"
                  >
                    <span>Sample 2:</span> <strong>PAT-202608-F4A1B</strong> <span style={{ opacity: 0.75 }}>(Meera • O+)</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { setQuery('JIV-2026-685853'); handleSearch(e, 'JIV-2026-685853'); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      border: '1.5px solid rgba(99, 102, 241, 0.35)',
                      color: '#4f46e5',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Click to test sample demo ID JIV-2026-685853 (Rajesh Varma)"
                  >
                    <span>Sample 3:</span> <strong>JIV-2026-685853</strong> <span style={{ opacity: 0.75 }}>(Rajesh • A+)</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div style={{ padding: '36px 20px', textAlign: 'center', backgroundColor: 'var(--surface-raised)', borderRadius: '20px', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <QrCode size={56} style={{ color: '#0f766e' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Scan Physical Emergency Health Card QR</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, maxWidth: '440px' }}>
                Hold your camera or barcode scanner over the patient's JIVEXA Health Card to retrieve Level 1 Emergency Vitals.
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button type="button" onClick={(e) => { setQuery('JXV-STVAZREWPAT-202608-F4A1B'); setActiveSearchMode('id'); handleSearch(e, 'JXV-STVAZREWPAT-202608-F4A1B'); }} style={{ backgroundColor: '#0f766e', fontWeight: 800, borderRadius: '12px' }}>
                  Simulate Card Badge Scan (JXV-STVAZREWPAT-202608-F4A1B)
                </Button>
                <Button type="button" onClick={(e) => { setQuery('JXV-STVAZREW'); setActiveSearchMode('id'); handleSearch(e, 'JXV-STVAZREW'); }} style={{ backgroundColor: '#0284c7', fontWeight: 800, borderRadius: '12px' }}>
                  Simulate Card Scan (JXV-STVAZREW)
                </Button>
              </div>
            </div>
          )}

        </div>
      </Card>

      {/* ERROR MESSAGE DISPLAY */}
      {error && (
        <div style={{ backgroundColor: 'var(--error-light)', border: '1.5px solid var(--error)', borderRadius: '18px', padding: '18px 22px', color: 'var(--error)', fontSize: '0.94rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* JIVEXA HEALTH OS PATIENT INFORMATION CARD */}
      {profile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ backgroundColor: 'var(--surface)', borderRadius: '24px', border: '1.5px solid var(--border)', padding: '32px', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* 1. Header Section: Registered Name, Health ID & Verification Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0f766e 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '1.6rem',
                  boxShadow: '0 10px 22px -4px rgba(15,118,110,0.4)',
                  border: '3px solid var(--surface)'
                }}>
                  {profile.registeredName !== 'Not provided' ? profile.registeredName.charAt(0).toUpperCase() : 'P'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
                      {profile.registeredName}
                    </h2>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> {profile.verificationStatus}
                    </span>
                  </div>

                  {/* Health ID with Copy Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '0.92rem', fontFamily: 'monospace', fontWeight: 800, color: '#0f766e', backgroundColor: 'var(--surface-raised)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      JHID: {profile.healthId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(profile.healthId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}
                      title="Copy Health ID"
                    >
                      {copied ? <Check size={16} style={{ color: '#10b981' }} /> : <Copy size={16} />}
                    </button>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      • Level 1 Emergency Information Card
                    </span>
                  </div>
                </div>
              </div>

              {/* Verified Node Indicator */}
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1.5px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '16px',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} className="pulse-dot" />
                <div>
                  <span style={{ fontSize: '0.84rem', fontWeight: 900, color: '#047857', display: 'block' }}>
                    ⚡ Emergency Access Active
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                    Verified at {profile.verifiedAt}
                  </span>
                </div>
              </div>
            </div>

            {/* 8-FIELD PATIENT INFORMATION CARD GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }} className="grid-2-mobile">
              
              {/* Field 1: Patient's Registered Name */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '18px', padding: '18px', backgroundColor: 'var(--surface-raised)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  REGISTERED NAME
                </span>
                <p style={{ fontSize: '1.05rem', fontWeight: 900, color: profile.registeredName !== 'Not provided' ? 'var(--text-main)' : 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  {profile.registeredName}
                </p>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Official Jivexa Registration
                </span>
              </div>

              {/* Field 2: Health ID */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '18px', padding: '18px', backgroundColor: 'var(--surface-raised)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  HEALTH ID
                </span>
                <p style={{ fontSize: '1.05rem', fontWeight: 900, fontFamily: 'monospace', color: '#0f766e', margin: '6px 0 0 0' }}>
                  {profile.healthId}
                </p>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Unique ABHA/JHID Record
                </span>
              </div>

              {/* Field 3: Age or Date of Birth */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '18px', padding: '18px', backgroundColor: 'var(--surface-raised)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  AGE / DATE OF BIRTH
                </span>
                <p style={{ fontSize: '1.05rem', fontWeight: 900, color: profile.ageOrDob !== 'Not provided' ? 'var(--text-main)' : 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  {profile.ageOrDob}
                </p>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  {profile.gender !== 'Not provided' ? `Gender: ${profile.gender}` : 'Demographic Record'}
                </span>
              </div>

              {/* Field 4: Blood Group */}
              <div style={{
                border: profile.bloodGroup !== 'Not provided' ? '1.5px solid #10b981' : '1px solid var(--border)',
                borderRadius: '18px',
                padding: '18px',
                backgroundColor: profile.bloodGroup !== 'Not provided' ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface-raised)'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: profile.bloodGroup !== 'Not provided' ? '#047857' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  BLOOD GROUP
                </span>
                <p style={{ fontSize: '1.25rem', fontWeight: 900, color: profile.bloodGroup !== 'Not provided' ? '#047857' : 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  {profile.bloodGroup}
                </p>
                <span style={{ fontSize: '0.72rem', color: profile.bloodGroup !== 'Not provided' ? '#059669' : 'var(--text-muted)', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                  {profile.bloodGroup !== 'Not provided' ? 'Critical Transfusion Match' : 'Unrecorded'}
                </span>
              </div>

              {/* Field 5: Critical Allergies */}
              <div style={{
                border: profile.allergies !== 'Not provided' ? '1.5px solid #ef4444' : '1px solid var(--border)',
                borderRadius: '18px',
                padding: '18px',
                backgroundColor: profile.allergies !== 'Not provided' ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-raised)'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: profile.allergies !== 'Not provided' ? '#b91c1c' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ⚠️ CRITICAL ALLERGIES
                </span>
                <p style={{ fontSize: '0.98rem', fontWeight: 900, color: profile.allergies !== 'Not provided' ? '#b91c1c' : 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  {profile.allergies}
                </p>
                <span style={{ fontSize: '0.72rem', color: profile.allergies !== 'Not provided' ? '#b91c1c' : 'var(--text-muted)', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                  {profile.allergies !== 'Not provided' ? 'Check before administering drugs' : 'No Severe Allergies Recorded'}
                </span>
              </div>

              {/* Field 6: Relevant Emergency Medical Info */}
              <div style={{
                border: profile.emergencyMedicalInfo !== 'Not provided' ? '1.5px solid #0284c7' : '1px solid var(--border)',
                borderRadius: '18px',
                padding: '18px',
                backgroundColor: profile.emergencyMedicalInfo !== 'Not provided' ? 'rgba(2, 132, 199, 0.08)' : 'var(--surface-raised)'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: profile.emergencyMedicalInfo !== 'Not provided' ? '#0369a1' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  EMERGENCY MEDICAL INFO
                </span>
                <p style={{ fontSize: '0.98rem', fontWeight: 900, color: profile.emergencyMedicalInfo !== 'Not provided' ? '#0369a1' : 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  {profile.emergencyMedicalInfo}
                </p>
                <span style={{ fontSize: '0.72rem', color: profile.emergencyMedicalInfo !== 'Not provided' ? '#0284c7' : 'var(--text-muted)', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                  Chronic conditions & emergency notes
                </span>
              </div>

            </div>

            {/* Field 7 & 8: Emergency Contact & Verification Status Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '18px' }} className="grid-2-mobile">
              
              {/* Field 7: Emergency Contact Name & Phone */}
              <div style={{
                backgroundColor: profile.emergencyContact !== 'Not provided' ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface-raised)',
                border: profile.emergencyContact !== 'Not provided' ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                padding: '18px 22px',
                borderRadius: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: profile.emergencyContact !== 'Not provided' ? 'rgba(245, 158, 11, 0.2)' : 'var(--surface)',
                  color: profile.emergencyContact !== 'Not provided' ? '#d97706' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <PhoneCall size={22} />
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: profile.emergencyContact !== 'Not provided' ? '#b45309' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    EMERGENCY CONTACT NAME & PHONE NUMBER
                  </span>
                  <p style={{ fontSize: '1rem', fontWeight: 900, color: profile.emergencyContact !== 'Not provided' ? '#92400e' : 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    {profile.emergencyContact}
                  </p>
                </div>
              </div>

              {/* Field 8: Verification Status Card */}
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1.5px solid rgba(16, 185, 129, 0.35)',
                padding: '18px 22px',
                borderRadius: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px'
              }}>
                <CheckCircle2 size={32} style={{ color: '#059669', flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    VERIFICATION STATUS
                  </span>
                  <p style={{ fontSize: '1rem', fontWeight: 900, color: '#047857', margin: '4px 0 0 0' }}>
                    {profile.verificationStatus}
                  </p>
                </div>
              </div>

            </div>

            {/* FIRST RESPONDER 1-CLICK AMBULANCE ACTION BAR */}
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1.5px solid #ef4444', borderRadius: '20px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#ef4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(239, 68, 68, 0.4)' }}>
                  <Siren size={24} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#b91c1c', margin: 0 }}>
                    First Responder Emergency Dispatch
                  </h4>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Immediate ambulance routing and nearest trauma ICU pre-notification for Health ID {profile.healthId}
                  </span>
                </div>
              </div>

              <Button onClick={() => window.location.href = '#/ambulance/booking'} style={{ backgroundColor: '#ef4444', fontWeight: 900, borderRadius: '14px', padding: '12px 24px', fontSize: '0.92rem' }}>
                <Siren size={18} style={{ marginRight: '8px' }} />
                Dispatch Emergency Ambulance 108
              </Button>
            </div>

            {/* PROTECTED CLINICAL DATA PRIVACY SHIELD */}
            <div style={{ backgroundColor: 'var(--surface-raised)', border: '1.5px dashed var(--border)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontWeight: 900, fontSize: '1rem' }}>
                <Lock size={20} style={{ color: '#0f766e' }} />
                <span>Protected Clinical Data (Level 2 & Level 3 Access Control)</span>
              </div>

              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                Under NDHM/ABDM medical data privacy compliance, full clinical history, diagnostic records, address, and credentials are protected with 256-bit encryption and hidden from public lookup:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.86rem', color: 'var(--text-muted)' }} className="grid-2-mobile">
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  🔒 Diagnostic Lab & Imaging Reports
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  🔒 Active Prescription History
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  🔒 Practitioner Consultation Notes
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  🔒 Historical Medical EHR Records & Home Address
                </span>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Are you an authorized medical practitioner? Sign in to your verified workstation to request patient consent.
                </span>
                <a href="#/login?role=DOCTOR" style={{ fontSize: '0.86rem', fontWeight: 900, color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--primary-light)', padding: '8px 16px', borderRadius: '10px' }}>
                  <UserCheck size={16} /> Doctor Login & Verification ↗
                </a>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* HEALTH ID LOOKUP WORKFLOW GUIDE SECTION */}
      <div style={{
        backgroundColor: 'var(--surface)',
        color: 'var(--text-main)',
        borderRadius: '24px',
        border: '1px solid var(--border)',
        padding: '32px',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Workflow Guide
          </span>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
            How Emergency Health ID Verification Works
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.6' }}>
            A secure 4-step protocol designed for zero-delay response while safeguarding patient medical privacy.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="grid-2-mobile">
          <div style={{ backgroundColor: 'var(--surface-raised)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.95rem' }}>
              01
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Scan or Enter JHID</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
              First responder inputs the registered Health ID or scans the patient's physical QR badge.
            </p>
          </div>

          <div style={{ backgroundColor: 'var(--surface-raised)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.95rem' }}>
              02
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Instant Level 1 Access</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
              System validates registration status and presents authorized emergency vitals.
            </p>
          </div>

          <div style={{ backgroundColor: 'var(--surface-raised)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.95rem' }}>
              03
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Critical Vitals Check</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
              Review blood group compatibility, severe drug allergies, and reach emergency family contacts.
            </p>
          </div>

          <div style={{ backgroundColor: 'var(--surface-raised)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.95rem' }}>
              04
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>Ambulance Dispatch</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
              Initiate 1-click GPS 108 ambulance dispatch and alert the nearest ICU receiving station.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
