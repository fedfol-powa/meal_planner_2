-- Every equivalence states where it comes from (verified equivalences, spec section 2;
-- the domain schema of W4 requires a non-blank source).
alter table app.ingredient_unit_equivalences
	alter column source set not null,
	add constraint ingredient_unit_equivalences_source_not_blank check (btrim(source) <> '');
