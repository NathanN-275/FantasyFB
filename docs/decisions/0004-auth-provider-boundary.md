# Separate authentication from database infrastructure

Authentication will remain behind `AuthProvider` so the GitHub OAuth implementation and session store can change without changing private-workspace authorization rules or domain modules.
