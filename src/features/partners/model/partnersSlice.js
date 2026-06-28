import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  byTenantId: {},
};

const partnersSlice = createSlice({
  name: "partners",
  initialState,
  reducers: {
    partnersCacheUpdated(state, action) {
      state.byTenantId[action.payload.tenantId] = action.payload.partners;
    },
  },
});

export const { partnersCacheUpdated } = partnersSlice.actions;
export const partnersReducer = partnersSlice.reducer;
