export const selectAuthUser = (state) => state.auth.user;
export const selectAuthToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => Boolean(state.auth.token);
export const selectIsEngineAdmin = (state) => Boolean(state.auth.user?.isEngineAdmin);
