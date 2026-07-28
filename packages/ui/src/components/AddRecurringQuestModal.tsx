'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Save, Coins, CalendarDays } from 'lucide-react';
import { iconMapper } from '../lib/iconMapper';
import { Button } from './Button';
import { Input } from './Input';
import { TransactionTypeToggle } from './TransactionTypeToggle';
import { Dropdown } from './Dropdown';
import type { TagDto, VaultDto } from '@expense-tracker/shared';

interface AddRecurringQuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialData?: any;
  onSave?: (data: any) => void;
  availableTags?: TagDto[];
  availableVaults?: VaultDto[];
  onCreateTag?: (name: string) => Promise<TagDto | null>;
}

const INTERVALS = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateInput = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date) return toDateInputValue(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return toDateInputValue(parsed);
  }
  return '';
};

const getDefaultStartDate = () => toDateInputValue(new Date());

const getDefaultEndDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return toDateInputValue(d);
};

export function AddRecurringQuestModal({ isOpen, onClose, title, initialData, onSave, availableTags = [], availableVaults = [], onCreateTag }: AddRecurringQuestModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [name, setName] = useState(initialData?.title || initialData?.name || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [isExpense, setIsExpense] = useState(initialData ? initialData.type === 'EXPENSE' : true);

  // Date states
  const [startDate, setStartDate] = useState(normalizeDateInput(initialData?.startDate) || getDefaultStartDate());
  const [endDate, setEndDate] = useState(normalizeDateInput(initialData?.endDate) || getDefaultEndDate());

  // Tag state — selectedTagIds stores UUIDs of selected tags
  const [tagInput, setTagInput] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialData?.tagIds || []);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Vault state
  const [selectedVaultId, setSelectedVaultId] = useState<string>(initialData?.vaultId || availableVaults[0]?.id || '');
  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);

  // Interval state
  const [selectedInterval, setSelectedInterval] = useState(
    initialData?.frequency && INTERVALS.map((i) => i.toLowerCase()).includes(initialData.frequency.toLowerCase())
      ? INTERVALS.find((i) => i.toLowerCase() === initialData.frequency.toLowerCase()) || INTERVALS[2]
      : INTERVALS[2],
  );

  const selectedVault = availableVaults.find((v) => v.id === selectedVaultId) || availableVaults[0];
  const SelectedVaultIcon = iconMapper(selectedVault?.icon || 'Briefcase');

  const tagInputUpper = tagInput.trim().toUpperCase();

  const suggestions = availableTags
    .filter((t) => !selectedTagIds.includes(t.id))
    .filter((t) => tagInputUpper.length === 0 || t.name.toUpperCase().includes(tagInputUpper))
    .slice(0, 3);

  const selectedTagObjects = availableTags.filter((t) => selectedTagIds.includes(t.id));

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
    setTagInput('');
  };

  const handleCreateTag = async () => {
    if (!tagInput.trim() || !onCreateTag || isCreatingTag) return;
    setIsCreatingTag(true);
    const newTag = await onCreateTag(tagInput.trim());
    if (newTag) {
      setSelectedTagIds((prev) => [...prev, newTag.id]);
      setTagInput('');
    }
    setIsCreatingTag(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const exact = availableTags.find((t) => t.name.toUpperCase() === tagInputUpper);
      if (exact && !selectedTagIds.includes(exact.id)) {
        toggleTag(exact.id);
      } else if (onCreateTag) {
        handleCreateTag();
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.title || initialData.name || '');
        setAmount(initialData.amount?.toString() || '');
        setIsExpense(initialData.type === 'EXPENSE');
        setStartDate(normalizeDateInput(initialData.startDate) || getDefaultStartDate());
        setEndDate(normalizeDateInput(initialData.endDate) || getDefaultEndDate());
        setSelectedTagIds(initialData.tagIds || []);
        if (initialData.frequency) {
          const match = INTERVALS.find((i) => i.toLowerCase() === initialData.frequency.toLowerCase());
          if (match) setSelectedInterval(match);
        }
        if (initialData.vaultId) setSelectedVaultId(initialData.vaultId);
      } else {
        setName('');
        setAmount('');
        setIsExpense(true);
        setStartDate(getDefaultStartDate());
        setEndDate(getDefaultEndDate());
        setSelectedTagIds([]);
        setSelectedInterval(INTERVALS[2]);
        if (availableVaults[0]) setSelectedVaultId(availableVaults[0].id);
      }
      setShouldRender(true);
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      setIsVaultDropdownOpen(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialData]);

  // Sync default vault when vaults first load
  useEffect(() => {
    if (!selectedVaultId && availableVaults[0]) {
      setSelectedVaultId(availableVaults[0].id);
    }
  }, [availableVaults]);

  if (!shouldRender) return null;

  const handleSave = () => {
    const dataToSave = {
      id: initialData?.id,
      title: name,
      name,
      amount: parseFloat(amount) || 0,
      type: isExpense ? 'EXPENSE' : 'INCOME',
      tagIds: selectedTagIds,
      vaultId: selectedVaultId || null,
      startDate: startDate || null,
      endDate: endDate || null,
      frequency: selectedInterval,
      selectedInterval,
    };
    if (onSave) onSave(dataToSave);
    onClose();
  };

  const canCreateTag = tagInput.trim().length > 0 && !!onCreateTag && !availableTags.find((t) => t.name.toUpperCase() === tagInputUpper) && !isCreatingTag;

  return (
    <>
      <div className={`fixed inset-0 bg-black/70 z-[100] transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />

      <div
        className={`fixed bottom-0 left-0 right-0 md:left-1/2 md:-translate-x-1/2 z-[110] w-full max-w-md md:max-w-2xl bg-surface-container-high border-4 border-black shadow-[inset_2px_2px_0px_rgba(255,255,255,0.1),_inset_-2px_-2px_0px_rgba(0,0,0,0.4)] flex flex-col mt-auto mx-auto max-h-[90vh] overflow-y-auto rounded-t-xl transition-transform duration-300 ease-in-out custom-scrollbar ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-12 h-1.5 bg-black/20 rounded-full"></div>
        </div>

        <header className="px-6 pt-2 pb-4 shrink-0 border-b-4 border-black/5">
          <div className="flex justify-between items-center">
            <h2 className="font-headline-md text-primary uppercase flex items-center gap-2">
              <Plus className="w-6 h-6" />
              {title}
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-surface-container-highest border-4 border-black flex items-center justify-center active:translate-y-0.5 active:shadow-none hover:bg-error-container hover:text-on-error-container transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </header>

        <main className="px-6 py-6 pt-0 space-y-5 overflow-y-auto">
          {/* Name Input */}
          <div className="space-y-2 mt-4">
            <label className="pixel-input-label ml-1">NAME</label>
            <Input placeholder="e.g. Health Potion Subscription" value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="pixel-input-label ml-1">AMOUNT</label>
            <div className="relative flex items-center">
              <div className="absolute left-4 flex items-center pointer-events-none">
                <Coins className="text-secondary" />
              </div>
              <input
                className="w-full h-14 pl-14 pr-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-headline-sm text-secondary placeholder:text-surface-variant focus:outline-none focus:ring-0"
                placeholder="0.00"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Transaction Type Toggle */}
          <div className="space-y-2">
            <label className="pixel-input-label ml-1">TYPE</label>
            <TransactionTypeToggle isExpense={isExpense} onChange={setIsExpense} />
          </div>

          {/* Tags Autocomplete Section */}
          <div className="space-y-2">
            <label className="pixel-input-label ml-1">TAGS</label>
            <div className="relative">
              {selectedTagObjects.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedTagObjects.map((tag) => (
                    <span
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className="bg-tertiary-container text-sm text-on-tertiary-container font-bold border-4 border-black px-3 py-1 font-label-caps flex items-center gap-1 active:translate-y-0.5 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                    >
                      {tag.name.toUpperCase()} <X size={14} />
                    </span>
                  ))}
                </div>
              )}

              <input
                className="w-full h-12 px-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-body-lg text-on-surface focus:outline-none placeholder:text-surface-variant"
                placeholder="Search or create tags..."
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              {/* Suggestions from existing tags */}
              {suggestions.length > 0 && (
                <div className="space-y-2 mt-3">
                  <p className="text-[10px] font-label-caps text-outline ml-1">{tagInput.length > 0 ? 'MATCHING TAGS' : 'INITIAL SUGGESTIONS'}</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((tag) => (
                      <span
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className="bg-surface-container-highest text-sm border-4 border-black px-3 py-1 font-label-caps font-bold flex items-center gap-1 active:translate-y-0.5 cursor-pointer hover:bg-surface-container-high transition-colors"
                      >
                        {tag.name.toUpperCase()} <Plus size={14} />
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Create new tag option */}
              {canCreateTag && (
                <div className="mt-3">
                  <span
                    onClick={handleCreateTag}
                    className="bg-surface-container-highest border-4 border-black px-3 py-1 font-label-caps text-primary flex items-center w-fit gap-1 active:translate-y-0.5 cursor-pointer"
                  >
                    CREATE: {tagInputUpper} <Plus size={14} />
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Start and End Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="pixel-input-label ml-1">START DATE</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-12 px-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-body-lg text-on-surface focus:outline-none placeholder:text-surface-variant [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="pixel-input-label ml-1">END DATE</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-12 px-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-body-lg text-on-surface focus:outline-none placeholder:text-surface-variant [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Source Vault Selection */}
          {availableVaults.length > 0 && (
            <div className="space-y-2">
              <label className="pixel-input-label ml-1">SOURCE VAULT</label>
              <Dropdown
                options={availableVaults}
                value={selectedVault}
                onChange={(vault) => setSelectedVaultId(vault.id)}
                keyExtractor={(vault) => vault.id}
                direction="down"
                renderValue={(vault) => {
                  const VaultIcon = iconMapper(vault?.icon || 'Briefcase');
                  return (
                    <>
                      <VaultIcon className="text-secondary" size={20} />
                      <span className="text-primary font-bold">{vault?.name || 'Select vault'}</span>
                    </>
                  );
                }}
                renderOption={(vault, isSelected) => {
                  const VaultIcon = iconMapper(vault.icon || 'Briefcase');
                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <VaultIcon className={isSelected ? 'text-secondary' : 'text-outline'} size={20} />
                        <span className={`font-body-lg ${isSelected ? 'text-primary font-bold' : 'text-on-surface'}`}>{vault.name}</span>
                      </div>
                      {isSelected && <div className="w-4 h-4 bg-primary border-2 border-black" />}
                    </>
                  );
                }}
              />
            </div>
          )}

          {/* Interval Dropdown */}
          <div className="space-y-2">
            <label className="pixel-input-label ml-1">INTERVAL</label>
            <Dropdown
              options={INTERVALS}
              value={selectedInterval}
              onChange={setSelectedInterval}
              keyExtractor={(interval) => interval}
              direction="up"
              renderValue={(interval) => (
                <>
                  <CalendarDays className="text-secondary" size={20} />
                  <span className="text-primary font-bold">{interval}</span>
                </>
              )}
              renderOption={(interval, isSelected) => (
                <>
                  <span className={`font-body-lg ${isSelected ? 'text-primary font-bold' : 'text-on-surface'}`}>{interval}</span>
                  {isSelected && <div className="w-4 h-4 bg-primary border-2 border-black" />}
                </>
              )}
            />
          </div>

          <div className="pt-2">
            <Button variant="primary" className="w-full py-3 flex items-center justify-center gap-2 group" onClick={handleSave}>
              <Save className="w-5 h-5 group-active:scale-90 transition-transform" />
              <span className="font-headline-sm uppercase tracking-wider">{initialData ? 'Save Changes' : 'Create Record'}</span>
            </Button>
          </div>
        </main>

        {/* Footer Decor */}
        <div className="px-6 pb-6 pt-2 flex justify-between items-center opacity-30">
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-primary border-2 border-black"></div>
            <div className="w-3 h-3 bg-secondary border-2 border-black"></div>
            <div className="w-3 h-3 bg-tertiary border-2 border-black"></div>
          </div>
          <p className="font-label-caps text-[10px]">NEW_RECORD_INTERFACE</p>
        </div>
      </div>
    </>
  );
}
