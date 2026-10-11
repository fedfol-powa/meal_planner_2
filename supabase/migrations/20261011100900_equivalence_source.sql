-- Every equivalence states where it comes from (verified equivalences, spec section 2).
-- Same rule as the domain schema of W4 (z.string().trim().min(1)): a source made only
-- of the characters JavaScript's trim removes is blank.
alter table app.ingredient_unit_equivalences
	alter column source set not null,
	add constraint ingredient_unit_equivalences_source_not_blank check (
		source !~ '^[\t\n\v\f\r    -     　﻿]*$'
	);
