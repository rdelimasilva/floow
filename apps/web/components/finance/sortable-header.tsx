'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, Filter } from 'lucide-react'

interface SortableHeaderProps {
  label: string
  sortKey: string
  currentSortBy: string
  currentSortDir: 'asc' | 'desc'
  onSort: (sortKey: string) => void
  filterContent?: React.ReactNode
  hasActiveFilter?: boolean
  className?: string
}

export function SortableHeader({
  label,
  sortKey,
  currentSortBy,
  currentSortDir,
  onSort,
  filterContent,
  hasActiveFilter,
  className = '',
}: SortableHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isActive = currentSortBy === sortKey
  const SortIcon = currentSortDir === 'asc' ? ChevronUp : ChevronDown

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen])

  return (
    <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 ${className}`}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-0.5 hover:text-gray-700 transition-colors"
        >
          {label}
          {isActive && <SortIcon className="h-3.5 w-3.5" />}
        </button>

        {filterContent && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`rounded p-0.5 transition-colors ${
                hasActiveFilter ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Filter className="h-3 w-3" />
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                {filterContent}
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  )
}
