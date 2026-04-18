import React from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '../ui/Input'
import { useAtlasStore } from '../../store/atlasStore'

export function SearchBar() {
  const searchQuery   = useAtlasStore((s) => s.searchQuery)
  const setSearchQuery = useAtlasStore((s) => s.setSearchQuery)

  return (
    <div className="relative">
      <Input
        placeholder="Search muscles…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        leftIcon={<Search size={13} />}
        rightIcon={
          searchQuery.length > 0
            ? (
              <button
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )
            : undefined
        }
        aria-label="Search structures"
      />
    </div>
  )
}
