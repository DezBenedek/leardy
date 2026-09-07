import 'package:leardy/data/seed/catalog.dart';
import 'package:leardy/domain/models.dart';
import 'package:leardy/providers.dart';

bool bundleMatchesQuery({
  required BundleView bundle,
  required String search,
  required CardsQuery query,
  required bool discover,
  String? subjectName,
  Set<String>? classBundleIds,
  String? subjectDisplay,
}) {
  if (discover && bundle.saved) return false;
  if (query.kind == 'topic' && !bundle.isTopic) return false;
  if (query.kind == 'skill' && !bundle.isSkill) return false;
  if (subjectName != null && subjectName.isNotEmpty) {
    if (subjectIdForName(bundle.subject) != subjectIdForName(subjectName)) {
      return false;
    }
  }
  if (classBundleIds != null && !classBundleIds.contains(bundle.id)) return false;
  if (search.trim().isEmpty) return true;
  final q = search.toLowerCase();
  final huName = subjectHuNameFor(bundle.subject).toLowerCase();
  return bundle.title.toLowerCase().contains(q) ||
      bundle.subject.toLowerCase().contains(q) ||
      huName.contains(q) ||
      (subjectDisplay != null &&
          subjectDisplay.toLowerCase().contains(q));
}

List<ClassMember> classroomStudents(Classroom classroom) => classroom.students;
