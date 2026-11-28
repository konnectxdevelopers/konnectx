import { useMemo, useState } from 'react';

export default function useRoleSearch(roles) {
  const [query, setQuery] = useState('');
  const filteredRoles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return roles;
    }

    return roles.filter((role) =>
      `${role.title} ${role.description}`.toLowerCase().includes(normalizedQuery)
    );
  }, [query, roles]);

  return { query, setQuery, filteredRoles };
}
