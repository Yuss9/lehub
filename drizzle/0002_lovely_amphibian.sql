CREATE INDEX "document_household_idx" ON "document" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "equipment_household_idx" ON "equipment" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "intervention_household_idx" ON "intervention" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "maintenance_household_idx" ON "maintenance" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "room_household_idx" ON "room" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "shoppingItem_household_idx" ON "shopping_item" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "shoppingList_household_idx" ON "shopping_list" USING btree ("household_id");